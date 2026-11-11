import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, UPLOAD_DIR, DATA_DIR } from './db.js';
import { randomId, hashPassword, verifyPassword } from './security.js';
import { publicUser } from './auth.js';

const DEFAULT_STATUSES = [
  ['待处理', '#87909e', 'open'],
  ['进行中', '#4a9eff', 'active'],
  ['审核中', '#a25ddc', 'active'],
  ['已完成', '#2ea44f', 'done'],
  ['已关闭', '#6b7280', 'closed'],
];

const PRIORITY_LABELS = { 1: '紧急', 2: '高', 3: '普通', 4: '低' };

function todayStr(offset = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function logActivity(workspaceId, taskId, userId, type, message) {
  getDb()
    .prepare('INSERT INTO activity (id, workspace_id, task_id, user_id, type, message, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(randomId(), workspaceId, taskId, userId, type, message, new Date().toISOString());
}

function workspaceRole(workspaceId, userId) {
  const row = getDb()
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId);
  return row?.role || null;
}

function accessibleList(listId, userId) {
  return getDb()
    .prepare(
      `SELECT l.*, s.workspace_id, s.name AS space_name, s.color AS space_color, s.icon AS space_icon,
              f.name AS folder_name, w.name AS workspace_name
       FROM lists l
       JOIN spaces s ON s.id = l.space_id
       JOIN workspaces w ON w.id = s.workspace_id
       JOIN workspace_members m ON m.workspace_id = s.workspace_id AND m.user_id = ?
       LEFT JOIN folders f ON f.id = l.folder_id
       WHERE l.id = ?`
    )
    .get(userId, listId);
}

function accessibleTask(taskId, userId) {
  return getDb()
    .prepare(
      `SELECT t.*, l.name AS list_name, l.space_id, l.color AS list_color,
              s.workspace_id, s.name AS space_name
       FROM tasks t
       JOIN lists l ON l.id = t.list_id
       JOIN spaces s ON s.id = l.space_id
       JOIN workspace_members m ON m.workspace_id = s.workspace_id AND m.user_id = ?
       WHERE t.id = ?`
    )
    .get(userId, taskId);
}

function shapeTask(row) {
  if (!row) return null;
  const {
    assignee_name,
    assignee_color,
    assignee_title,
    status_name,
    status_color,
    status_type,
    ...base
  } = row;
  return {
    ...base,
    status: { id: row.status_id, name: status_name, color: status_color, type: status_type },
    assignee: row.assignee_id
      ? { id: row.assignee_id, name: assignee_name, color: assignee_color, title: assignee_title }
      : null,
    tags: [],
    subtask_count: row.subtask_count || 0,
    comment_count: row.comment_count || 0,
    checklist_total: row.checklist_total || 0,
    checklist_done: row.checklist_done || 0,
  };
}

function attachTaskMeta(tasks) {
  const db = getDb();
  if (!tasks.length) return tasks;
  const ids = tasks.map((task) => task.id);
  const placeholders = ids.map(() => '?').join(',');
  const tagRows = db
    .prepare(
      `SELECT tt.task_id, tg.id, tg.name, tg.color FROM task_tags tt
       JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id IN (${placeholders})`
    )
    .all(...ids);
  const tagsByTask = new Map();
  for (const tag of tagRows) {
    if (!tagsByTask.has(tag.task_id)) tagsByTask.set(tag.task_id, []);
    tagsByTask.get(tag.task_id).push({ id: tag.id, name: tag.name, color: tag.color });
  }
  for (const task of tasks) {
    task.tags = tagsByTask.get(task.id) || [];
  }
  return tasks;
}

function taskQuery(whereClause, orderClause = 't.order_index ASC') {
  return `SELECT t.*, u.name AS assignee_name, u.color AS assignee_color, u.title AS assignee_title,
                 st.name AS status_name, st.color AS status_color, st.type AS status_type,
                 (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS subtask_count,
                 (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
                 (SELECT COUNT(*) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_total,
                 (SELECT COALESCE(SUM(ci.done), 0) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_done
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assignee_id
          LEFT JOIN statuses st ON st.id = t.status_id
          WHERE ${whereClause}
          ORDER BY ${orderClause}`;
}

function loadTaskDetail(taskId, userId) {
  const db = getDb();
  const task = accessibleTask(taskId, userId);
  if (!task) return null;
  const row = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name, u.color AS assignee_color, u.title AS assignee_title,
              st.name AS status_name, st.color AS status_color, st.type AS status_type,
              (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS subtask_count,
              (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
              (SELECT COUNT(*) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_total,
              (SELECT COALESCE(SUM(ci.done), 0) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_done
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN statuses st ON st.id = t.status_id
       WHERE t.id = ?`
    )
    .get(taskId);
  const shaped = shapeTask(row);
  attachTaskMeta([shaped]);
  const fields = db
    .prepare('SELECT * FROM custom_fields WHERE list_id = ? ORDER BY order_index')
    .all(shaped.list_id)
    .map((field) => ({ ...field, options: JSON.parse(field.options || '[]') }));
  const values = db.prepare('SELECT field_id, value FROM task_field_values WHERE task_id = ?').all(taskId);
  const fieldValues = {};
  for (const value of values) fieldValues[value.field_id] = value.value;

  const subRows = db.prepare(taskQuery('t.parent_id = ?', 't.order_index ASC')).all(taskId);
  const subtasks = attachTaskMeta(subRows.map(shapeTask));

  const checklists = db.prepare('SELECT * FROM checklists WHERE task_id = ? ORDER BY order_index').all(taskId);
  for (const checklist of checklists) {
    checklist.items = db
      .prepare('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY order_index, rowid')
      .all(checklist.id);
  }
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS user_name, u.color AS user_color FROM comments c
       JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at ASC`
    )
    .all(taskId);
  const attachments = db.prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  const activity = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.color AS user_color FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.task_id = ? ORDER BY a.created_at DESC LIMIT 40`
    )
    .all(taskId);
  let parent = null;
  if (shaped.parent_id) {
    parent = db.prepare('SELECT id, name FROM tasks WHERE id = ?').get(shaped.parent_id);
  }
  const tags = db
    .prepare(
      `SELECT tg.id, tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = ?`
    )
    .all(taskId);
  const statuses = db
    .prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index, rowid')
    .all(shaped.list_id);
  return {
    ...shaped,
    tags,
    statuses,
    list: {
      id: task.list_id,
      name: task.list_name,
      color: task.list_color,
      space_id: task.space_id,
      space_name: task.space_name,
      workspace_id: task.workspace_id,
    },
    parent,
    subtasks,
    checklists,
    comments,
    attachments: attachments.map((attachment) => ({
      ...attachment,
      url: `/api/attachments/${attachment.id}/download`,
    })),
    activity,
    fields,
    field_values: fieldValues,
  };
}

function getWorkspaceOrFirst(userId, workspaceId) {
  const db = getDb();
  const memberships = db
    .prepare(
      `SELECT w.*, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ? ORDER BY w.created_at ASC`
    )
    .all(userId);
  if (!memberships.length) return { workspace: null, memberships: [] };
  const selected = workspaceId ? memberships.find((m) => m.id === workspaceId) : memberships[0];
  return { workspace: selected || memberships[0], memberships };
}

export function createApiRouter() {
  const router = express.Router();
  const db = getDb();

  router.get('/bootstrap', (req, res) => {
    const { workspace, memberships } = getWorkspaceOrFirst(req.user.id, req.query.workspaceId);
    if (!workspace) return res.json({ user: req.user, workspaces: [], workspace: null, spaces: [] });
    const spaces = db
      .prepare('SELECT * FROM spaces WHERE workspace_id = ? ORDER BY order_index, created_at')
      .all(workspace.id);
    const folders = db
      .prepare(
        `SELECT f.* FROM folders f JOIN spaces s ON s.id = f.space_id
         WHERE s.workspace_id = ? ORDER BY f.order_index, f.created_at`
      )
      .all(workspace.id);
    const lists = db
      .prepare(
        `SELECT l.* FROM lists l JOIN spaces s ON s.id = l.space_id
         WHERE s.workspace_id = ? ORDER BY l.order_index, l.created_at`
      )
      .all(workspace.id);
    const listIds = lists.map((l) => l.id);
    const taskCounts = {};
    if (listIds.length) {
      const rows = db
        .prepare(
          `SELECT t.list_id AS list_id, COUNT(*) AS total,
                  SUM(CASE WHEN st.type IN ('done','closed') THEN 1 ELSE 0 END) AS done
           FROM tasks t JOIN statuses st ON st.id = t.status_id
           WHERE t.archived = 0 AND t.parent_id IS NULL AND t.list_id IN (${listIds.map(() => '?').join(',')})
           GROUP BY t.list_id`
        )
        .all(...listIds);
      for (const row of rows) taskCounts[row.list_id] = row;
    }
    const tree = spaces.map((space) => {
      const spaceFolders = folders
        .filter((folder) => folder.space_id === space.id)
        .map((folder) => ({
          ...folder,
          lists: lists
            .filter((list) => list.folder_id === folder.id)
            .map((list) => ({
              ...list,
              task_count: taskCounts[list.id]?.total || 0,
              done_count: taskCounts[list.id]?.done || 0,
            })),
        }));
      return {
        ...space,
        folders: spaceFolders,
        lists: lists
          .filter((list) => list.space_id === space.id && !list.folder_id)
          .map((list) => ({
            ...list,
            task_count: taskCounts[list.id]?.total || 0,
            done_count: taskCounts[list.id]?.done || 0,
          })),
      };
    });
    const members = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.color, u.title, m.role FROM workspace_members m
         JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name`
      )
      .all(workspace.id);
    const tags = db.prepare('SELECT * FROM tags WHERE workspace_id = ? ORDER BY name').all(workspace.id);
    const docs = db
      .prepare(
        `SELECT d.id, d.title, d.updated_at, d.created_at, u.name AS author_name, u.color AS author_color
         FROM docs d LEFT JOIN users u ON u.id = d.created_by
         WHERE d.workspace_id = ? ORDER BY d.updated_at DESC`
      )
      .all(workspace.id);
    const readState = db
      .prepare('SELECT last_read_at FROM workspace_reads WHERE workspace_id = ? AND user_id = ?')
      .get(workspace.id, req.user.id);
    const lastRead = readState?.last_read_at || '1970-01-01T00:00:00.000Z';
    const unreadCount = db
      .prepare('SELECT COUNT(*) AS c FROM activity WHERE workspace_id = ? AND created_at > ?')
      .get(workspace.id, lastRead).c;
    res.json({
      user: req.user,
      workspaces: memberships,
      workspace,
      role: workspace.role,
      spaces: tree,
      members,
      tags,
      docs,
      unread_count: unreadCount,
      last_read_at: lastRead,
    });
  });

  router.get('/lists/:id', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const statuses = db
      .prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index, rowid')
      .all(list.id);
    const fields = db
      .prepare('SELECT * FROM custom_fields WHERE list_id = ? ORDER BY order_index')
      .all(list.id)
      .map((field) => ({ ...field, options: JSON.parse(field.options || '[]') }));
    const includeArchived = req.query.include_archived === '1';
    const rows = db
      .prepare(taskQuery(`t.list_id = ? AND t.parent_id IS NULL ${includeArchived ? '' : 'AND t.archived = 0'}`))
      .all(list.id);
    const tasks = attachTaskMeta(rows.map(shapeTask));
    res.json({ list, statuses, fields, tasks });
  });

  router.post('/tasks', (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: '任务名称不能为空' });
    let listId = body.list_id;
    let parentId = body.parent_id || null;
    if (parentId) {
      const parent = accessibleTask(parentId, req.user.id);
      if (!parent) return res.status(404).json({ error: '父任务不存在' });
      listId = parent.list_id;
    }
    const list = accessibleList(listId, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    let statusId = body.status_id;
    const statusRows = db.prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index').all(list.id);
    if (!statusId || !statusRows.some((s) => s.id === statusId)) statusId = statusRows[0]?.id;
    if (!statusId) return res.status(400).json({ error: '列表缺少工作流状态' });
    const status = statusRows.find((s) => s.id === statusId);
    let assigneeId = body.assignee_id || null;
    if (assigneeId && !workspaceRole(list.workspace_id, assigneeId)) assigneeId = null;
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), 0) AS max FROM tasks WHERE list_id = ?').get(list.id).max;
    const id = randomId();
    const now = new Date().toISOString();
    const completedAt = status.type === 'done' || status.type === 'closed' ? now : null;
    db.prepare(
      `INSERT INTO tasks (id, list_id, parent_id, name, description, status_id, priority, assignee_id, start_date, due_date, time_estimate, order_index, created_by, created_at, updated_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      list.id,
      parentId,
      name,
      String(body.description || ''),
      statusId,
      Number(body.priority) || 0,
      assigneeId,
      body.start_date || null,
      body.due_date || null,
      body.time_estimate ?? null,
      maxOrder + 100,
      req.user.id,
      now,
      now,
      completedAt
    );
    const tagIds = Array.isArray(body.tag_ids) ? body.tag_ids : [];
    for (const tagId of tagIds) {
      const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND workspace_id = ?').get(tagId, list.workspace_id);
      if (tag) db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(id, tag.id);
    }
    logActivity(list.workspace_id, id, req.user.id, 'task_created', `创建了任务「${name}」`);
    res.status(201).json(loadTaskDetail(id, req.user.id));
  });

  router.patch('/tasks/:id', (req, res) => {
    const existing = accessibleTask(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: '任务不存在' });
    const dbAny = db;
    const body = req.body || {};
    const updates = [];
    const values = [];
    const statusRows = dbAny.prepare('SELECT * FROM statuses WHERE list_id = ?').all(existing.list_id);
    let completedAt = existing.completed_at;
    const messages = [];

    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== existing.name) {
      updates.push('name = ?');
      values.push(body.name.trim());
      messages.push(`将任务重命名为「${body.name.trim()}」`);
    }
    if (typeof body.description === 'string') {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.status_id && body.status_id !== existing.status_id) {
      const status = statusRows.find((s) => s.id === body.status_id);
      if (!status) return res.status(400).json({ error: '状态不属于当前列表' });
      updates.push('status_id = ?');
      values.push(status.id);
      completedAt = status.type === 'done' || status.type === 'closed' ? new Date().toISOString() : null;
      updates.push('completed_at = ?');
      values.push(completedAt);
      messages.push(`将状态改为「${status.name}」`);
    }
    if (body.priority !== undefined) {
      const priority = Math.max(0, Math.min(4, Number(body.priority) || 0));
      updates.push('priority = ?');
      values.push(priority);
      if (priority !== existing.priority) messages.push(`将优先级设为「${PRIORITY_LABELS[priority] || '无'}」`);
    }
    if (body.assignee_id !== undefined) {
      let assigneeId = body.assignee_id || null;
      if (assigneeId && !workspaceRole(existing.workspace_id, assigneeId)) {
        return res.status(400).json({ error: '指派成员不在当前工作空间' });
      }
      updates.push('assignee_id = ?');
      values.push(assigneeId);
      if (assigneeId !== existing.assignee_id) {
        const member = assigneeId ? dbAny.prepare('SELECT name FROM users WHERE id = ?').get(assigneeId) : null;
        messages.push(member ? `将任务指派给 ${member.name}` : '移除了任务负责人');
      }
    }
    for (const field of ['start_date', 'due_date']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field] || null);
      }
    }
    if (body.time_estimate !== undefined) {
      updates.push('time_estimate = ?');
      values.push(body.time_estimate === null || body.time_estimate === '' ? null : Number(body.time_estimate));
    }
    if (body.archived !== undefined) {
      updates.push('archived = ?');
      values.push(body.archived ? 1 : 0);
    }
    if (updates.length) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);
      dbAny.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    if (Array.isArray(body.tag_ids)) {
      dbAny.prepare('DELETE FROM task_tags WHERE task_id = ?').run(existing.id);
      for (const tagId of body.tag_ids) {
        const tag = dbAny.prepare('SELECT id FROM tags WHERE id = ? AND workspace_id = ?').get(tagId, existing.workspace_id);
        if (tag) dbAny.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(existing.id, tag.id);
      }
    }
    if (body.fields && typeof body.fields === 'object') {
      for (const [fieldId, value] of Object.entries(body.fields)) {
        const field = dbAny.prepare('SELECT id FROM custom_fields WHERE id = ? AND list_id = ?').get(fieldId, existing.list_id);
        if (!field) continue;
        if (value === null || value === '') {
          dbAny.prepare('DELETE FROM task_field_values WHERE task_id = ? AND field_id = ?').run(existing.id, fieldId);
        } else {
          dbAny
            .prepare(
              `INSERT INTO task_field_values (task_id, field_id, value) VALUES (?,?,?)
               ON CONFLICT(task_id, field_id) DO UPDATE SET value = excluded.value`
            )
            .run(existing.id, fieldId, String(value));
        }
      }
    }
    if (messages.length) {
      logActivity(existing.workspace_id, existing.id, req.user.id, 'task_updated', messages[0]);
    }
    res.json(loadTaskDetail(existing.id, req.user.id));
  });

  router.post('/tasks/:id/move', (req, res) => {
    const existing = accessibleTask(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: '任务不存在' });
    const statusId = req.body?.status_id || existing.status_id;
    const status = db.prepare('SELECT * FROM statuses WHERE id = ? AND list_id = ?').get(statusId, existing.list_id);
    if (!status) return res.status(400).json({ error: '状态不属于当前列表' });
    const siblings = db
      .prepare(
        `SELECT id FROM tasks WHERE list_id = ? AND status_id = ? AND parent_id IS NULL AND archived = 0 AND id != ?
         ORDER BY order_index`
      )
      .all(existing.list_id, statusId, existing.id)
      .map((row) => row.id);
    const index = Math.max(0, Math.min(Number(req.body?.index ?? siblings.length), siblings.length));
    siblings.splice(index, 0, existing.id);
    const update = db.prepare('UPDATE tasks SET order_index = ? WHERE id = ?');
    siblings.forEach((id, siblingIndex) => update.run((siblingIndex + 1) * 100, id));
    const completedAt =
      status.type === 'done' || status.type === 'closed' ? new Date().toISOString() : null;
    db.prepare('UPDATE tasks SET status_id = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
      statusId,
      completedAt,
      new Date().toISOString(),
      existing.id
    );
    if (statusId !== existing.status_id) {
      logActivity(
        existing.workspace_id,
        existing.id,
        req.user.id,
        'task_updated',
        `将状态改为「${status.name}」`
      );
    }
    res.json({ ok: true });
  });

  router.delete('/tasks/:id', (req, res) => {
    const existing = accessibleTask(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: '任务不存在' });
    logActivity(existing.workspace_id, null, req.user.id, 'task_deleted', `删除了任务「${existing.name}」`);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  router.post('/tasks/:id/comments', (req, res) => {
    const existing = accessibleTask(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: '任务不存在' });
    const text = String(req.body?.body || '').trim();
    if (!text) return res.status(400).json({ error: '评论内容不能为空' });
    const id = randomId();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)').run(
      id,
      existing.id,
      req.user.id,
      text,
      now
    );
    logActivity(existing.workspace_id, existing.id, req.user.id, 'comment', `在「${existing.name}」中发表了评论`);
    res.status(201).json({
      id,
      task_id: existing.id,
      user_id: req.user.id,
      body: text,
      created_at: now,
      user_name: req.user.name,
      user_color: req.user.color,
    });
  });

  router.delete('/comments/:id', (req, res) => {
    const comment = db
      .prepare(
        `SELECT c.*, s.workspace_id FROM comments c JOIN tasks t ON t.id = c.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE c.id = ?`
      )
      .get(req.params.id);
    if (!comment) return res.status(404).json({ error: '评论不存在' });
    const role = workspaceRole(comment.workspace_id, req.user.id);
    if (comment.user_id !== req.user.id && role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: '没有权限删除此评论' });
    }
    db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
    res.json({ ok: true });
  });

  router.post('/tasks/:id/checklists', (req, res) => {
    const task = accessibleTask(req.params.id, req.user.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    const name = String(req.body?.name || '检查项');
    const id = randomId();
    db.prepare('INSERT INTO checklists (id, task_id, name, order_index) VALUES (?,?,?,?)').run(
      id,
      task.id,
      name,
      (db.prepare('SELECT COUNT(*) AS c FROM checklists WHERE task_id = ?').get(task.id).c || 0) + 1
    );
    res.status(201).json({ id, task_id: task.id, name, items: [] });
  });

  router.delete('/checklists/:id', (req, res) => {
    const checklist = db
      .prepare(
        `SELECT c.*, s.workspace_id FROM checklists c JOIN tasks t ON t.id = c.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE c.id = ?`
      )
      .get(req.params.id);
    if (!checklist || !workspaceRole(checklist.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '清单不存在' });
    }
    db.prepare('DELETE FROM checklists WHERE id = ?').run(checklist.id);
    res.json({ ok: true });
  });

  router.post('/checklists/:id/items', (req, res) => {
    const checklist = db
      .prepare(
        `SELECT c.*, s.workspace_id FROM checklists c JOIN tasks t ON t.id = c.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE c.id = ?`
      )
      .get(req.params.id);
    if (!checklist || !workspaceRole(checklist.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '清单不存在' });
    }
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '检查项内容不能为空' });
    const id = randomId();
    const next = (db.prepare('SELECT COUNT(*) AS c FROM checklist_items WHERE checklist_id = ?').get(checklist.id).c || 0) + 1;
    db.prepare('INSERT INTO checklist_items (id, checklist_id, name, done, order_index) VALUES (?,?,?,?,?)').run(
      id,
      checklist.id,
      name,
      0,
      next
    );
    res.status(201).json({ id, checklist_id: checklist.id, name, done: 0, order_index: next });
  });

  router.patch('/checklist-items/:id', (req, res) => {
    const item = db
      .prepare(
        `SELECT ci.*, s.workspace_id FROM checklist_items ci
         JOIN checklists c ON c.id = ci.checklist_id JOIN tasks t ON t.id = c.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE ci.id = ?`
      )
      .get(req.params.id);
    if (!item || !workspaceRole(item.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '检查项不存在' });
    }
    if (req.body?.done !== undefined) {
      db.prepare('UPDATE checklist_items SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, item.id);
    }
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      db.prepare('UPDATE checklist_items SET name = ? WHERE id = ?').run(req.body.name.trim(), item.id);
    }
    res.json(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(item.id));
  });

  router.delete('/checklist-items/:id', (req, res) => {
    const item = db
      .prepare(
        `SELECT ci.*, s.workspace_id FROM checklist_items ci
         JOIN checklists c ON c.id = ci.checklist_id JOIN tasks t ON t.id = c.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE ci.id = ?`
      )
      .get(req.params.id);
    if (!item || !workspaceRole(item.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '检查项不存在' });
    }
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(item.id);
    res.json({ ok: true });
  });

  router.post('/tasks/:id/attachments', (req, res) => {
    const task = accessibleTask(req.params.id, req.user.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    const name = String(req.body?.name || '附件').trim();
    const data = req.body?.data;
    if (!data) return res.status(400).json({ error: '附件内容为空' });
    const buffer = Buffer.from(String(data), 'base64');
    if (buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: '附件不能超过 20MB' });
    const id = randomId();
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'attachment';
    const stored = `${id}-${safeName}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), buffer);
    db.prepare(
      'INSERT INTO attachments (id, task_id, user_id, name, mime, size, file_path, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      id,
      task.id,
      req.user.id,
      safeName,
      String(req.body?.mime || 'application/octet-stream'),
      buffer.length,
      stored,
      new Date().toISOString()
    );
    logActivity(task.workspace_id, task.id, req.user.id, 'attachment', `为「${task.name}」添加了附件 ${safeName}`);
    res.status(201).json({
      id,
      name: safeName,
      mime: req.body?.mime || 'application/octet-stream',
      size: buffer.length,
      url: `/api/attachments/${id}/download`,
      created_at: new Date().toISOString(),
    });
  });

  router.get('/attachments/:id/download', (req, res) => {
    const attachment = db
      .prepare(
        `SELECT a.*, s.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE a.id = ?`
      )
      .get(req.params.id);
    if (!attachment || !workspaceRole(attachment.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '附件不存在' });
    }
    const filePath = path.join(UPLOAD_DIR, attachment.file_path);
    if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '附件文件不存在' });
    }
    res.setHeader('Content-Type', attachment.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    fs.createReadStream(filePath).pipe(res);
  });

  router.delete('/attachments/:id', (req, res) => {
    const attachment = db
      .prepare(
        `SELECT a.*, s.workspace_id FROM attachments a JOIN tasks t ON t.id = a.task_id
         JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id WHERE a.id = ?`
      )
      .get(req.params.id);
    if (!attachment || !workspaceRole(attachment.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '附件不存在' });
    }
    db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
    const filePath = path.join(UPLOAD_DIR, attachment.file_path);
    if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  });

  router.get('/tasks/:id', (req, res) => {
    const detail = loadTaskDetail(req.params.id, req.user.id);
    if (!detail) return res.status(404).json({ error: '任务不存在' });
    res.json(detail);
  });

  router.get('/system', (req, res) => {
    const dbFile = path.join(DATA_DIR, 'clickup.db');
    let dbBytes = 0;
    try {
      dbBytes = fs.statSync(dbFile).size;
    } catch {
      dbBytes = 0;
    }
    res.json({
      version: '1.0.0',
      data_dir: DATA_DIR,
      db_bytes: dbBytes,
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      workspaces: db.prepare('SELECT COUNT(*) AS c FROM workspaces').get().c,
      tasks: db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c,
    });
  });

  router.get('/backup', (req, res) => {
    const dbFile = path.join(DATA_DIR, 'clickup.db');
    try {
      db.exec('PRAGMA wal_checkpoint(FULL)');
    } catch {
      // The database can still be downloaded if the checkpoint fails.
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(dbFile, `clickup-backup-${stamp}.db`);
  });

  router.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ tasks: [], lists: [], docs: [] });
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.query.workspaceId);
    if (!workspace) return res.json({ tasks: [], lists: [], docs: [] });
    const like = `%${q}%`;
    const taskRows = db
      .prepare(
        `SELECT t.*, u.name AS assignee_name, u.color AS assignee_color, u.title AS assignee_title,
                st.name AS status_name, st.color AS status_color, st.type AS status_type,
                l.name AS list_name, l.color AS list_color, f.name AS folder_name, sp.name AS space_name,
                (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS subtask_count,
                (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
                (SELECT COUNT(*) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_total,
                (SELECT COALESCE(SUM(ci.done), 0) FROM checklists cl JOIN checklist_items ci ON ci.checklist_id = cl.id WHERE cl.task_id = t.id) AS checklist_done
         FROM tasks t JOIN lists l ON l.id = t.list_id JOIN spaces sp ON sp.id = l.space_id
         LEFT JOIN folders f ON f.id = l.folder_id
         LEFT JOIN users u ON u.id = t.assignee_id
         LEFT JOIN statuses st ON st.id = t.status_id
         WHERE sp.workspace_id = ? AND t.archived = 0 AND (t.name LIKE ? OR t.description LIKE ?)
         ORDER BY t.updated_at DESC LIMIT 30`
      )
      .all(workspace.id, like, like);
    const tasks = attachTaskMeta(taskRows.map(shapeTask));
    const lists = db
      .prepare(
        `SELECT l.id, l.name, l.color, l.icon, sp.name AS space_name, f.name AS folder_name
         FROM lists l JOIN spaces sp ON sp.id = l.space_id LEFT JOIN folders f ON f.id = l.folder_id
         WHERE sp.workspace_id = ? AND l.name LIKE ? LIMIT 10`
      )
      .all(workspace.id, like);
    const docs = db
      .prepare('SELECT id, title, updated_at FROM docs WHERE workspace_id = ? AND (title LIKE ? OR content LIKE ?) LIMIT 10')
      .all(workspace.id, like, like);
    res.json({ tasks, lists, docs });
  });

  router.get('/home', (req, res) => {
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.query.workspaceId);
    if (!workspace) return res.json(null);
    const today = todayStr();
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    weekAgo.setHours(0, 0, 0, 0);
    const base = `FROM tasks t JOIN lists l ON l.id = t.list_id JOIN spaces sp ON sp.id = l.space_id
                  JOIN statuses st ON st.id = t.status_id
                  LEFT JOIN users u ON u.id = t.assignee_id
                  WHERE sp.workspace_id = ? AND t.archived = 0 AND t.parent_id IS NULL`;
    const all = db
      .prepare(`SELECT t.id, t.name, t.due_date, t.priority, t.completed_at, t.created_at,
                       st.type AS status_type, st.name AS status_name, st.color AS status_color,
                       l.id AS list_id, l.name AS list_name, l.color AS list_color,
                       u.name AS assignee_name, u.color AS assignee_color, u.id AS assignee_id
                ${base}`)
      .all(workspace.id);
    const open = all.filter((task) => !['done', 'closed'].includes(task.status_type));
    const completed = all.filter((task) => ['done', 'closed'].includes(task.status_type));
    const overdue = open.filter((task) => task.due_date && task.due_date < today);
    const dueToday = open.filter((task) => task.due_date === today);
    const completedThisWeek = completed.filter((task) => task.completed_at && new Date(task.completed_at) >= weekAgo);
    const myOpen = open
      .filter((task) => task.assignee_id === req.user.id)
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
      .slice(0, 10);
    const workloadMap = new Map();
    for (const task of open) {
      const entry = workloadMap.get(task.list_id) || {
        id: task.list_id,
        name: task.list_name,
        color: task.list_color,
        count: 0,
      };
      entry.count += 1;
      workloadMap.set(task.list_id, entry);
    }
    const workload = [...workloadMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);
    const activity = db
      .prepare(
        `SELECT a.*, u.name AS user_name, u.color AS user_color, t.name AS task_name
         FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN tasks t ON t.id = a.task_id
         WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 14`
      )
      .all(workspace.id);
    const completedSeries = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = todayStr(-i);
      completedSeries.push({
        date,
        count: completed.filter((task) => (task.completed_at || '').slice(0, 10) === date).length,
      });
    }
    res.json({
      stats: {
        total: all.length,
        open: open.length,
        completed: completed.length,
        overdue: overdue.length,
        dueToday: dueToday.length,
        completedThisWeek: completedThisWeek.length,
        completionRate: all.length ? Math.round((completed.length / all.length) * 100) : 0,
      },
      my_tasks: myOpen,
      overdue_tasks: overdue.slice(0, 5),
      activity,
      workload,
      completed_series: completedSeries,
    });
  });

  router.get('/inbox', (req, res) => {
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.query.workspaceId);
    if (!workspace) return res.json({ activity: [] });
    const readState = db
      .prepare('SELECT last_read_at FROM workspace_reads WHERE workspace_id = ? AND user_id = ?')
      .get(workspace.id, req.user.id);
    const lastRead = readState?.last_read_at || '1970-01-01T00:00:00.000Z';
    const activity = db
      .prepare(
        `SELECT a.*, u.name AS user_name, u.color AS user_color, t.name AS task_name,
                l.id AS list_id, l.name AS list_name
         FROM activity a LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN tasks t ON t.id = a.task_id LEFT JOIN lists l ON l.id = t.list_id
         WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 80`
      )
      .all(workspace.id)
      .map((item) => ({ ...item, unread: item.created_at > lastRead }));
    res.json({ activity, last_read_at: lastRead, unread_count: activity.filter((item) => item.unread).length });
  });

  router.post('/inbox/read', (req, res) => {
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.body?.workspace_id);
    if (!workspace) return res.status(400).json({ error: '没有可用的工作空间' });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workspace_reads (workspace_id, user_id, last_read_at) VALUES (?,?,?)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    ).run(workspace.id, req.user.id, now);
    res.json({ ok: true, last_read_at: now });
  });

  router.get('/docs', (req, res) => {
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.query.workspaceId);
    if (!workspace) return res.json([]);
    const docs = db
      .prepare(
        `SELECT d.*, u.name AS author_name, u.color AS author_color FROM docs d
         LEFT JOIN users u ON u.id = d.created_by WHERE d.workspace_id = ? ORDER BY d.updated_at DESC`
      )
      .all(workspace.id);
    res.json(docs);
  });

  router.post('/docs', (req, res) => {
    const { workspace } = getWorkspaceOrFirst(req.user.id, req.body?.workspace_id);
    if (!workspace) return res.status(400).json({ error: '没有可用工作空间' });
    const title = String(req.body?.title || '无标题文档').trim() || '无标题文档';
    const id = randomId();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO docs (id, workspace_id, title, content, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(
      id,
      workspace.id,
      title,
      String(req.body?.content || ''),
      req.user.id,
      now,
      now
    );
    logActivity(workspace.id, null, req.user.id, 'doc_created', `创建了文档「${title}」`);
    res.status(201).json(db.prepare('SELECT * FROM docs WHERE id = ?').get(id));
  });

  router.get('/docs/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(req.params.id);
    if (!doc || !workspaceRole(doc.workspace_id, req.user.id)) return res.status(404).json({ error: '文档不存在' });
    const author = db.prepare('SELECT name, color FROM users WHERE id = ?').get(doc.created_by);
    res.json({ ...doc, author_name: author?.name, author_color: author?.color });
  });

  router.patch('/docs/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(req.params.id);
    if (!doc || !workspaceRole(doc.workspace_id, req.user.id)) return res.status(404).json({ error: '文档不存在' });
    const title = req.body?.title !== undefined ? String(req.body.title).trim() || '无标题文档' : doc.title;
    const content = req.body?.content !== undefined ? String(req.body.content) : doc.content;
    db.prepare('UPDATE docs SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
      title,
      content,
      new Date().toISOString(),
      doc.id
    );
    res.json(db.prepare('SELECT * FROM docs WHERE id = ?').get(doc.id));
  });

  router.delete('/docs/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(req.params.id);
    if (!doc || !workspaceRole(doc.workspace_id, req.user.id)) return res.status(404).json({ error: '文档不存在' });
    db.prepare('DELETE FROM docs WHERE id = ?').run(doc.id);
    res.json({ ok: true });
  });

  router.post('/spaces', (req, res) => {
    const workspaceId = req.body?.workspace_id;
    if (!workspaceRole(workspaceId, req.user.id)) return res.status(403).json({ error: '没有权限' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '空间名称不能为空' });
    const id = randomId();
    const count = db.prepare('SELECT COUNT(*) AS c FROM spaces WHERE workspace_id = ?').get(workspaceId).c;
    db.prepare(
      'INSERT INTO spaces (id, workspace_id, name, color, icon, is_private, order_index, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, workspaceId, name, req.body?.color || '#7B68EE', req.body?.icon || '🚀', 0, count, new Date().toISOString());
    logActivity(workspaceId, null, req.user.id, 'space_created', `创建了空间「${name}」`);
    res.status(201).json(db.prepare('SELECT * FROM spaces WHERE id = ?').get(id));
  });

  router.patch('/spaces/:id', (req, res) => {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
    if (!space || !workspaceRole(space.workspace_id, req.user.id)) return res.status(404).json({ error: '空间不存在' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || space.name : space.name;
    db.prepare('UPDATE spaces SET name = ?, color = ?, icon = ? WHERE id = ?').run(
      name,
      req.body?.color || space.color,
      req.body?.icon || space.icon,
      space.id
    );
    res.json(db.prepare('SELECT * FROM spaces WHERE id = ?').get(space.id));
  });

  router.delete('/spaces/:id', (req, res) => {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
    if (!space || !workspaceRole(space.workspace_id, req.user.id)) return res.status(404).json({ error: '空间不存在' });
    db.prepare('DELETE FROM spaces WHERE id = ?').run(space.id);
    logActivity(space.workspace_id, null, req.user.id, 'space_deleted', `删除了空间「${space.name}」`);
    res.json({ ok: true });
  });

  router.post('/folders', (req, res) => {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.body?.space_id);
    if (!space || !workspaceRole(space.workspace_id, req.user.id)) return res.status(404).json({ error: '空间不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '文件夹名称不能为空' });
    const id = randomId();
    const count = db.prepare('SELECT COUNT(*) AS c FROM folders WHERE space_id = ?').get(space.id).c;
    db.prepare('INSERT INTO folders (id, space_id, name, order_index, created_at) VALUES (?,?,?,?,?)').run(
      id,
      space.id,
      name,
      count,
      new Date().toISOString()
    );
    res.status(201).json(db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
  });

  router.patch('/folders/:id', (req, res) => {
    const folder = db
      .prepare('SELECT f.*, s.workspace_id FROM folders f JOIN spaces s ON s.id = f.space_id WHERE f.id = ?')
      .get(req.params.id);
    if (!folder || !workspaceRole(folder.workspace_id, req.user.id)) return res.status(404).json({ error: '文件夹不存在' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || folder.name : folder.name;
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, folder.id);
    res.json(db.prepare('SELECT * FROM folders WHERE id = ?').get(folder.id));
  });

  router.delete('/folders/:id', (req, res) => {
    const folder = db
      .prepare('SELECT f.*, s.workspace_id FROM folders f JOIN spaces s ON s.id = f.space_id WHERE f.id = ?')
      .get(req.params.id);
    if (!folder || !workspaceRole(folder.workspace_id, req.user.id)) return res.status(404).json({ error: '文件夹不存在' });
    // Deleting a folder removes the lists inside it, matching the UI confirmation.
    const lists = db.prepare('SELECT id FROM lists WHERE folder_id = ?').all(folder.id);
    for (const list of lists) db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id);
    logActivity(folder.workspace_id, null, req.user.id, 'folder_deleted', `删除了文件夹「${folder.name}」`);
    res.json({ ok: true });
  });

  router.post('/lists', (req, res) => {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.body?.space_id);
    if (!space || !workspaceRole(space.workspace_id, req.user.id)) return res.status(404).json({ error: '空间不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '列表名称不能为空' });
    let folderId = req.body?.folder_id || null;
    if (folderId) {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND space_id = ?').get(folderId, space.id);
      if (!folder) folderId = null;
    }
    const id = randomId();
    const count = db.prepare('SELECT COUNT(*) AS c FROM lists WHERE space_id = ?').get(space.id).c;
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, order_index, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      space.id,
      folderId,
      name,
      req.body?.color || '#7B68EE',
      req.body?.icon || '📋',
      String(req.body?.description || ''),
      count,
      now
    );
    DEFAULT_STATUSES.forEach(([statusName, color, type], index) => {
      db.prepare('INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)').run(
        randomId(),
        id,
        statusName,
        color,
        type,
        index
      );
    });
    logActivity(space.workspace_id, null, req.user.id, 'list_created', `创建了列表「${name}」`);
    res.status(201).json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
  });

  router.patch('/lists/:id', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || list.name : list.name;
    const description = req.body?.description !== undefined ? String(req.body.description) : list.description;
    db.prepare('UPDATE lists SET name = ?, color = ?, icon = ?, description = ? WHERE id = ?').run(
      name,
      req.body?.color || list.color,
      req.body?.icon || list.icon,
      description,
      list.id
    );
    res.json(accessibleList(list.id, req.user.id));
  });

  router.delete('/lists/:id', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
    logActivity(list.workspace_id, null, req.user.id, 'list_deleted', `删除了列表「${list.name}」`);
    res.json({ ok: true });
  });

  router.post('/lists/:id/statuses', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '状态名称不能为空' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM statuses WHERE list_id = ?').get(list.id).c;
    const id = randomId();
    db.prepare('INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)').run(
      id,
      list.id,
      name,
      req.body?.color || '#87909e',
      req.body?.type || 'open',
      count
    );
    res.status(201).json(db.prepare('SELECT * FROM statuses WHERE id = ?').get(id));
  });

  router.patch('/statuses/:id', (req, res) => {
    const status = db
      .prepare('SELECT st.*, s.workspace_id FROM statuses st JOIN lists l ON l.id = st.list_id JOIN spaces s ON s.id = l.space_id WHERE st.id = ?')
      .get(req.params.id);
    if (!status || !workspaceRole(status.workspace_id, req.user.id)) return res.status(404).json({ error: '状态不存在' });
    db.prepare('UPDATE statuses SET name = ?, color = ?, type = ? WHERE id = ?').run(
      req.body?.name !== undefined ? String(req.body.name).trim() || status.name : status.name,
      req.body?.color || status.color,
      req.body?.type || status.type,
      status.id
    );
    res.json(db.prepare('SELECT * FROM statuses WHERE id = ?').get(status.id));
  });

  router.delete('/statuses/:id', (req, res) => {
    const status = db
      .prepare('SELECT st.*, s.workspace_id, l.id AS list_id FROM statuses st JOIN lists l ON l.id = st.list_id JOIN spaces s ON s.id = l.space_id WHERE st.id = ?')
      .get(req.params.id);
    if (!status || !workspaceRole(status.workspace_id, req.user.id)) return res.status(404).json({ error: '状态不存在' });
    const statuses = db.prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index').all(status.list_id);
    if (statuses.length <= 1) return res.status(400).json({ error: '列表至少需要保留一个状态' });
    const fallback = statuses.find((s) => s.id !== status.id);
    db.prepare('UPDATE tasks SET status_id = ? WHERE status_id = ?').run(fallback.id, status.id);
    db.prepare('DELETE FROM statuses WHERE id = ?').run(status.id);
    res.json({ ok: true });
  });

  router.post('/lists/:id/statuses/reorder', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const valid = db.prepare('SELECT id FROM statuses WHERE list_id = ?').all(list.id).map((s) => s.id);
    if (ids.length !== valid.length || !ids.every((id) => valid.includes(id))) {
      return res.status(400).json({ error: '状态排序数据无效' });
    }
    ids.forEach((id, index) => db.prepare('UPDATE statuses SET order_index = ? WHERE id = ?').run(index, id));
    res.json(db.prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index').all(list.id));
  });

  router.post('/lists/:id/fields', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '字段名称不能为空' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM custom_fields WHERE list_id = ?').get(list.id).c;
    const id = randomId();
    db.prepare('INSERT INTO custom_fields (id, list_id, name, type, options, order_index) VALUES (?,?,?,?,?,?)').run(
      id,
      list.id,
      name,
      req.body?.type || 'text',
      JSON.stringify(Array.isArray(req.body?.options) ? req.body.options : []),
      count
    );
    const field = db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(id);
    res.status(201).json({ ...field, options: JSON.parse(field.options) });
  });

  router.patch('/fields/:id', (req, res) => {
    const field = db
      .prepare('SELECT cf.*, s.workspace_id FROM custom_fields cf JOIN lists l ON l.id = cf.list_id JOIN spaces s ON s.id = l.space_id WHERE cf.id = ?')
      .get(req.params.id);
    if (!field || !workspaceRole(field.workspace_id, req.user.id)) return res.status(404).json({ error: '字段不存在' });
    db.prepare('UPDATE custom_fields SET name = ?, options = ? WHERE id = ?').run(
      req.body?.name !== undefined ? String(req.body.name).trim() || field.name : field.name,
      JSON.stringify(Array.isArray(req.body?.options) ? req.body.options : JSON.parse(field.options || '[]')),
      field.id
    );
    const updated = db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(field.id);
    res.json({ ...updated, options: JSON.parse(updated.options) });
  });

  router.delete('/fields/:id', (req, res) => {
    const field = db
      .prepare('SELECT cf.*, s.workspace_id FROM custom_fields cf JOIN lists l ON l.id = cf.list_id JOIN spaces s ON s.id = l.space_id WHERE cf.id = ?')
      .get(req.params.id);
    if (!field || !workspaceRole(field.workspace_id, req.user.id)) return res.status(404).json({ error: '字段不存在' });
    db.prepare('DELETE FROM custom_fields WHERE id = ?').run(field.id);
    res.json({ ok: true });
  });

  router.post('/tags', (req, res) => {
    const workspaceId = req.body?.workspace_id;
    if (!workspaceRole(workspaceId, req.user.id)) return res.status(403).json({ error: '没有权限' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '标签名称不能为空' });
    const id = randomId();
    db.prepare('INSERT INTO tags (id, workspace_id, name, color) VALUES (?,?,?,?)').run(
      id,
      workspaceId,
      name,
      req.body?.color || '#7B68EE'
    );
    res.status(201).json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
  });

  router.patch('/tags/:id', (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
    if (!tag || !workspaceRole(tag.workspace_id, req.user.id)) return res.status(404).json({ error: '标签不存在' });
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(
      req.body?.name !== undefined ? String(req.body.name).trim() || tag.name : tag.name,
      req.body?.color || tag.color,
      tag.id
    );
    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id));
  });

  router.delete('/tags/:id', (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
    if (!tag || !workspaceRole(tag.workspace_id, req.user.id)) return res.status(404).json({ error: '标签不存在' });
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
    res.json({ ok: true });
  });

  router.post('/workspaces/:id/members', (req, res) => {
    const workspaceId = req.params.id;
    const role = workspaceRole(workspaceId, req.user.id);
    if (!role || (role !== 'owner' && role !== 'admin')) return res.status(403).json({ error: '只有管理员可以邀请成员' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
    const name = String(req.body?.name || email.split('@')[0]).trim();
    let user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
    let tempPassword = null;
    if (!user) {
      tempPassword = `cu-${Math.random().toString(36).slice(2, 8)}`;
      const { hash, salt } = hashPassword(tempPassword);
      const id = randomId();
      db.prepare(
        'INSERT INTO users (id, name, email, password_hash, password_salt, color, title, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(id, name, email, hash, salt, '#7B68EE', '', new Date().toISOString());
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const exists = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(workspaceId, user.id);
    if (exists) return res.status(409).json({ error: '该成员已在工作空间中' });
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)').run(
      workspaceId,
      user.id,
      req.body?.role === 'admin' ? 'admin' : 'member',
      new Date().toISOString()
    );
    logActivity(workspaceId, null, req.user.id, 'member_joined', `邀请 ${name} 加入了工作空间`);
    res.status(201).json({ user: publicUser(user), temp_password: tempPassword });
  });

  router.patch('/workspaces/:id/members/:userId', (req, res) => {
    const workspaceId = req.params.id;
    const role = workspaceRole(workspaceId, req.user.id);
    if (role !== 'owner') return res.status(403).json({ error: '只有所有者可以修改角色' });
    const target = workspaceRole(workspaceId, req.params.userId);
    if (!target) return res.status(404).json({ error: '成员不存在' });
    if (target === 'owner') return res.status(400).json({ error: '不能修改所有者角色' });
    const nextRole = req.body?.role === 'admin' ? 'admin' : 'member';
    db.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?').run(
      nextRole,
      workspaceId,
      req.params.userId
    );
    res.json({ ok: true });
  });

  router.delete('/workspaces/:id/members/:userId', (req, res) => {
    const workspaceId = req.params.id;
    const role = workspaceRole(workspaceId, req.user.id);
    const isSelf = req.params.userId === req.user.id;
    if (!role) return res.status(403).json({ error: '没有权限' });
    if (role !== 'owner' && role !== 'admin' && !isSelf) return res.status(403).json({ error: '没有权限' });
    const targetRole = workspaceRole(workspaceId, req.params.userId);
    if (targetRole === 'owner') return res.status(400).json({ error: '不能移除工作空间所有者' });
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(workspaceId, req.params.userId);
    res.json({ ok: true });
  });

  router.patch('/workspaces/:id', (req, res) => {
    const workspaceId = req.params.id;
    const role = workspaceRole(workspaceId, req.user.id);
    if (!role) return res.status(403).json({ error: '没有权限' });
    if (role !== 'owner' && role !== 'admin') return res.status(403).json({ error: '只有管理员可以修改工作空间' });
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || workspace.name : workspace.name;
    db.prepare('UPDATE workspaces SET name = ?, color = ? WHERE id = ?').run(name, req.body?.color || workspace.color, workspaceId);
    res.json(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId));
  });

  router.delete('/workspaces/:id', (req, res) => {
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!workspace) return res.status(404).json({ error: '工作空间不存在' });
    const role = workspaceRole(workspace.id, req.user.id);
    if (role !== 'owner') return res.status(403).json({ error: '只有工作空间所有者可以删除工作空间' });
    if (req.body?.confirm_name !== undefined && req.body.confirm_name !== workspace.name) {
      return res.status(400).json({ error: '工作空间名称不匹配' });
    }
    const files = db
      .prepare(
        `SELECT a.file_path FROM attachments a
         JOIN tasks t ON t.id = a.task_id
         JOIN lists l ON l.id = t.list_id
         JOIN spaces s ON s.id = l.space_id
         WHERE s.workspace_id = ?`
      )
      .all(workspace.id);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspace.id);
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file.file_path);
      try {
        if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // The database is already updated; leftover local files are harmless.
      }
    }
    const remaining = db
      .prepare('SELECT COUNT(*) AS c FROM workspace_members WHERE user_id = ?')
      .get(req.user.id).c;
    res.json({ ok: true, deleted: workspace.name, remaining_workspaces: remaining });
  });

  router.post('/workspaces', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '工作空间名称不能为空' });
    const id = randomId();
    const spaceId = randomId();
    const listId = randomId();
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO workspaces (id, name, color, owner_id, created_at) VALUES (?,?,?,?,?)').run(
        id,
        name,
        req.body?.color || '#7B68EE',
        req.user.id,
        now
      );
      db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)').run(
        id,
        req.user.id,
        'owner',
        now
      );
      db.prepare(
        'INSERT INTO spaces (id, workspace_id, name, color, icon, is_private, order_index, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(spaceId, id, '团队项目', '#7B68EE', '🚀', 0, 0, now);
      db.prepare(
        'INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, order_index, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(listId, spaceId, null, '任务清单', '#4a9eff', '📋', '新的开始，从这里添加第一个任务', 0, now);
      DEFAULT_STATUSES.forEach(([statusName, color, type], index) => {
        db.prepare('INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)').run(
          randomId(),
          listId,
          statusName,
          color,
          type,
          index
        );
      });
      db.prepare('INSERT INTO activity (id, workspace_id, task_id, user_id, type, message, created_at) VALUES (?,?,?,?,?,?,?)').run(
        randomId(),
        id,
        null,
        req.user.id,
        'workspace_created',
        `创建了工作空间「${name}」`,
        now
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.status(201).json(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id));
  });

  router.patch('/me', (req, res) => {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const body = req.body || {};
    if (body.new_password) {
      if (String(body.new_password).length < 6) return res.status(400).json({ error: '新密码至少需要 6 位' });
      if (!verifyPassword(String(body.current_password || ''), current.password_salt, current.password_hash)) {
        return res.status(400).json({ error: '当前密码不正确' });
      }
      const { hash, salt } = hashPassword(String(body.new_password));
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, current.id);
    }
    const name = body.name !== undefined ? String(body.name).trim() || current.name : current.name;
    const title = body.title !== undefined ? String(body.title) : current.title;
    const color = body.color || current.color;
    db.prepare('UPDATE users SET name = ?, title = ?, color = ? WHERE id = ?').run(name, title, color, current.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(current.id);
    res.json({ ...publicUser(updated), password_changed: Boolean(body.new_password) });
  });

  router.use((req, res) => res.status(404).json({ error: '接口不存在' }));

  return router;
}
