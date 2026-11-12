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

function isAssignable(workspaceId, userId) {
  if (!workspaceId || !userId) return false;
  if (workspaceRole(workspaceId, userId)) return true;
  return Boolean(
    getDb()
      .prepare('SELECT 1 AS ok FROM workspace_contacts WHERE workspace_id = ? AND user_id = ?')
      .get(workspaceId, userId)
  );
}

function dayOffsetFromToday(value) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateFromDayOffset(offset) {
  if (offset === null || offset === undefined || Number.isNaN(Number(offset))) return null;
  return todayStr(Number(offset));
}

function localDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildTemplateSnapshot(listId) {
  const db = getDb();
  const list = db
    .prepare(
      `SELECT l.*, s.workspace_id FROM lists l JOIN spaces s ON s.id = l.space_id WHERE l.id = ?`
    )
    .get(listId);
  if (!list) return null;
  const statuses = db
    .prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index, rowid')
    .all(listId);
  const fields = db
    .prepare('SELECT * FROM custom_fields WHERE list_id = ? ORDER BY order_index')
    .all(listId)
    .map((field) => ({
      name: field.name,
      type: field.type,
      options: JSON.parse(field.options || '[]'),
      order_index: field.order_index,
    }));
  const taskRows = db
    .prepare(
      `SELECT * FROM tasks WHERE list_id = ? AND archived = 0
       ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, order_index, created_at`
    )
    .all(listId);
  const indexByTaskId = new Map();
  taskRows.forEach((task, index) => indexByTaskId.set(task.id, index));
  const tasks = taskRows.map((task, index) => {
    const tagRows = db
      .prepare(
        `SELECT tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = ?`
      )
      .all(task.id);
    const checklists = db.prepare('SELECT * FROM checklists WHERE task_id = ? ORDER BY order_index').all(task.id);
    const checklistData = checklists.map((checklist) => ({
      name: checklist.name,
      items: db
        .prepare('SELECT name, done FROM checklist_items WHERE checklist_id = ? ORDER BY order_index, rowid')
        .all(checklist.id),
    }));
    const fieldValues = db
      .prepare(
        `SELECT cf.name, v.value FROM task_field_values v JOIN custom_fields cf ON cf.id = v.field_id WHERE v.task_id = ?`
      )
      .all(task.id);
    const fieldValueMap = {};
    for (const value of fieldValues) fieldValueMap[value.name] = value.value;
    const participantIds = db
      .prepare('SELECT user_id FROM task_participants WHERE task_id = ?')
      .all(task.id)
      .map((row) => row.user_id);
    return {
      index,
      parent_index: task.parent_id ? indexByTaskId.get(task.parent_id) ?? null : null,
      name: task.name,
      description: task.description || '',
      status_name: statuses.find((status) => status.id === task.status_id)?.name || statuses[0]?.name,
      priority: task.priority,
      assignee_id: task.assignee_id,
      start_offset: dayOffsetFromToday(task.start_date),
      due_offset: dayOffsetFromToday(task.due_date),
      order_index: task.order_index,
      tags: tagRows,
      checklists: checklistData,
      field_values: fieldValueMap,
      participant_ids: participantIds,
    };
  });
  const milestones = db
    .prepare('SELECT * FROM milestones WHERE list_id = ? ORDER BY due_date, order_index')
    .all(listId)
    .map((milestone) => ({
      name: milestone.name,
      description: milestone.description || '',
      due_offset: dayOffsetFromToday(milestone.due_date),
      completed: Boolean(milestone.completed),
      color: milestone.color,
      order_index: milestone.order_index,
    }));
  const phases = db
    .prepare('SELECT * FROM project_phases WHERE list_id = ? ORDER BY start_date, order_index')
    .all(listId)
    .map((phase) => ({
      name: phase.name,
      start_offset: dayOffsetFromToday(phase.start_date),
      end_offset: dayOffsetFromToday(phase.end_date),
      color: phase.color,
      order_index: phase.order_index,
    }));
  return {
    source_list: { name: list.name, icon: list.icon, color: list.color },
    list: {
      name: list.name,
      icon: list.icon,
      color: list.color,
      description: list.description || '',
      purpose: list.purpose || '',
    },
    statuses: statuses.map((status) => ({
      name: status.name,
      color: status.color,
      type: status.type,
      order_index: status.order_index,
    })),
    fields,
    tasks,
    milestones,
    phases,
  };
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

function accessibleRetrospective(retrospectiveId, userId) {
  return getDb()
    .prepare(
      `SELECT r.*, l.name AS list_name, s.workspace_id
       FROM retrospectives r
       JOIN lists l ON l.id = r.list_id
       JOIN spaces s ON s.id = l.space_id
       JOIN workspace_members m ON m.workspace_id = s.workspace_id AND m.user_id = ?
       WHERE r.id = ?`
    )
    .get(userId, retrospectiveId);
}

function snapshotRetrospectiveTasks(db, listId, retrospectiveId, now) {
  const today = todayStr();
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.due_date, t.completed_at, t.updated_at,
              st.name AS status_name, st.color AS status_color, st.type AS status_type,
              u.name AS assignee_name
       FROM tasks t
       LEFT JOIN statuses st ON st.id = t.status_id
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.list_id = ? AND t.archived = 0
       ORDER BY t.due_date, t.created_at`
    )
    .all(listId);
  const insert = db.prepare(
    `INSERT INTO retrospective_tasks
     (id, retrospective_id, task_id, name, status_name, status_color, status_type, assignee_name,
      due_date, completed_at, event_date, kind, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  let count = 0;
  for (const task of rows) {
    const completed = ['done', 'closed'].includes(task.status_type);
    const overdue = !completed && task.due_date && task.due_date < today;
    if (!completed && !overdue) continue;
    const eventDate = completed
      ? localDateKey(task.completed_at) || task.due_date || localDateKey(task.updated_at) || null
      : task.due_date;
    insert.run(
      randomId(),
      retrospectiveId,
      task.id,
      task.name,
      task.status_name || null,
      task.status_color || null,
      task.status_type || null,
      task.assignee_name || null,
      task.due_date || null,
      task.completed_at || null,
      eventDate,
      completed ? 'completed' : 'overdue',
      now
    );
    count += 1;
  }
  return count;
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
    participant_count: row.participant_count || 0,
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
                 (SELECT COUNT(*) FROM task_participants tp WHERE tp.task_id = t.id) AS participant_count,
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
              (SELECT COUNT(*) FROM task_participants tp WHERE tp.task_id = t.id) AS participant_count,
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
  const contactIds = new Set(
    db
      .prepare('SELECT user_id FROM workspace_contacts WHERE workspace_id = ?')
      .all(task.workspace_id)
      .map((row) => row.user_id)
  );
  const participants = db
    .prepare(
      `SELECT u.id, u.name, u.color, u.title, tp.created_at FROM task_participants tp
       JOIN users u ON u.id = tp.user_id WHERE tp.task_id = ? ORDER BY tp.created_at, u.name`
    )
    .all(taskId)
    .map((participant) => ({ ...participant, is_external: contactIds.has(participant.id) }));
  return {
    ...shaped,
    tags,
    statuses,
    participants,
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
    const contacts = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.color, u.title FROM workspace_contacts c
         JOIN users u ON u.id = c.user_id WHERE c.workspace_id = ? ORDER BY u.name`
      )
      .all(workspace.id)
      .map((contact) => ({ ...contact, is_external: true }));
    const templates = db
      .prepare(
        `SELECT id, name, icon, color, created_at, updated_at FROM project_templates
         WHERE workspace_id = ? ORDER BY updated_at DESC`
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
      contacts,
      assignees: [
        ...members.map((member) => ({ ...member, is_external: false })),
        ...contacts,
      ],
      templates,
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
    const milestones = db
      .prepare('SELECT * FROM milestones WHERE list_id = ? ORDER BY due_date, order_index, created_at')
      .all(list.id);
    const brainstormCount = db
      .prepare('SELECT COUNT(*) AS c FROM brainstorm_items WHERE list_id = ?')
      .get(list.id).c;
    const phases = db
      .prepare('SELECT * FROM project_phases WHERE list_id = ? ORDER BY start_date, order_index, created_at')
      .all(list.id);
    const retrospectiveCount = db
      .prepare('SELECT COUNT(*) AS c FROM retrospectives WHERE list_id = ?')
      .get(list.id).c;
    res.json({
      list,
      statuses,
      fields,
      tasks,
      milestones,
      phases,
      brainstorm_count: brainstormCount,
      retrospective_count: retrospectiveCount,
    });
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
    if (assigneeId && !isAssignable(list.workspace_id, assigneeId)) assigneeId = null;
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
    const participantIds = Array.isArray(body.participant_ids) ? body.participant_ids : [];
    for (const participantId of participantIds) {
      if (isAssignable(list.workspace_id, participantId)) {
        db.prepare('INSERT OR IGNORE INTO task_participants (task_id, user_id, created_at) VALUES (?,?,?)').run(
          id,
          participantId,
          now
        );
      }
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
      if (assigneeId && !isAssignable(existing.workspace_id, assigneeId)) {
        return res.status(400).json({ error: '该责任人不在当前工作空间的可指派名单中' });
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
    if (Array.isArray(body.participant_ids)) {
      dbAny.prepare('DELETE FROM task_participants WHERE task_id = ?').run(existing.id);
      const now = new Date().toISOString();
      for (const participantId of body.participant_ids) {
        if (!isAssignable(existing.workspace_id, participantId)) continue;
        dbAny
          .prepare('INSERT OR IGNORE INTO task_participants (task_id, user_id, created_at) VALUES (?,?,?)')
          .run(existing.id, participantId, now);
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
    if (!text) return res.status(400).json({ error: '进展内容不能为空' });
    const id = randomId();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?,?,?,?,?)').run(
      id,
      existing.id,
      req.user.id,
      text,
      now
    );
    logActivity(existing.workspace_id, existing.id, req.user.id, 'comment', `在「${existing.name}」中记录了进展`);
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
    if (!comment) return res.status(404).json({ error: '进展不存在' });
    const role = workspaceRole(comment.workspace_id, req.user.id);
    if (comment.user_id !== req.user.id && role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: '没有权限删除此进展' });
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
      version: '1.4.1',
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
                (SELECT COUNT(*) FROM task_participants tp WHERE tp.task_id = t.id) AS participant_count,
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
      'INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, purpose, order_index, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      space.id,
      folderId,
      name,
      req.body?.color || '#7B68EE',
      req.body?.icon || '📋',
      String(req.body?.description || ''),
      String(req.body?.purpose || ''),
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
    const purpose = req.body?.purpose !== undefined ? String(req.body.purpose) : list.purpose;
    db.prepare('UPDATE lists SET name = ?, color = ?, icon = ?, description = ?, purpose = ? WHERE id = ?').run(
      name,
      req.body?.color || list.color,
      req.body?.icon || list.icon,
      description,
      purpose,
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

  router.get('/lists/:id/brainstorm', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const items = db
      .prepare('SELECT * FROM brainstorm_items WHERE list_id = ? ORDER BY order_index, created_at')
      .all(list.id);
    res.json({ items, count: items.length });
  });

  router.post('/lists/:id/brainstorm', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '想法内容不能为空' });
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), 0) AS max FROM brainstorm_items WHERE list_id = ?')
      .get(list.id).max;
    const item = {
      id: randomId(),
      list_id: list.id,
      name,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      order_index: maxOrder + 1,
    };
    db.prepare(
      'INSERT INTO brainstorm_items (id, list_id, name, created_by, created_at, order_index) VALUES (?,?,?,?,?,?)'
    ).run(item.id, item.list_id, item.name, item.created_by, item.created_at, item.order_index);
    res.status(201).json(item);
  });

  router.delete('/brainstorm/:id', (req, res) => {
    const item = db
      .prepare(
        `SELECT b.*, s.workspace_id FROM brainstorm_items b
         JOIN lists l ON l.id = b.list_id JOIN spaces s ON s.id = l.space_id
         JOIN workspace_members m ON m.workspace_id = s.workspace_id AND m.user_id = ?
         WHERE b.id = ?`
      )
      .get(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: '想法不存在' });
    db.prepare('DELETE FROM brainstorm_items WHERE id = ?').run(item.id);
    res.json({ ok: true });
  });

  router.post('/lists/:id/brainstorm/commit', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const items = db
      .prepare('SELECT * FROM brainstorm_items WHERE list_id = ? ORDER BY order_index, created_at')
      .all(list.id);
    if (!items.length) return res.status(400).json({ error: '头脑风暴区还没有想法' });
    const statuses = db.prepare('SELECT * FROM statuses WHERE list_id = ? ORDER BY order_index').all(list.id);
    const target = statuses.find((status) => status.type === 'open') || statuses[0];
    if (!target) return res.status(400).json({ error: '列表缺少可用的工作流状态' });
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), 0) AS max FROM tasks WHERE list_id = ?')
      .get(list.id).max;
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      items.forEach((item, index) => {
        db.prepare(
          `INSERT INTO tasks (id, list_id, parent_id, name, description, status_id, priority, assignee_id, start_date, due_date, time_estimate, order_index, created_by, created_at, updated_at, completed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          randomId(),
          list.id,
          null,
          item.name,
          '',
          target.id,
          0,
          null,
          null,
          null,
          null,
          maxOrder + (index + 1) * 100,
          req.user.id,
          now,
          now,
          null
        );
      });
      db.prepare('DELETE FROM brainstorm_items WHERE list_id = ?').run(list.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    logActivity(
      list.workspace_id,
      null,
      req.user.id,
      'brainstorm_committed',
      `将 ${items.length} 条头脑风暴想法送入「${target.name}」`
    );
    res.json({ ok: true, created: items.length, status: target });
  });

  router.post('/lists/:id/phases', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '阶段名称不能为空' });
    const startDate = String(req.body?.start_date || '').trim();
    const endDate = String(req.body?.end_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: '请选择阶段的开始和结束日期' });
    }
    if (endDate < startDate) return res.status(400).json({ error: '阶段结束日期不能早于开始日期' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), 0) AS max FROM project_phases WHERE list_id = ?').get(list.id).max;
    const id = randomId();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO project_phases (id, list_id, name, start_date, end_date, color, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(id, list.id, name, startDate, endDate, req.body?.color || list.color || '#7B68EE', maxOrder + 1, now, now);
    logActivity(list.workspace_id, null, req.user.id, 'phase_created', `在「${list.name}」中新增项目阶段「${name}」`);
    res.status(201).json(db.prepare('SELECT * FROM project_phases WHERE id = ?').get(id));
  });

  router.patch('/phases/:id', (req, res) => {
    const phase = db
      .prepare(
        `SELECT p.*, s.workspace_id FROM project_phases p JOIN lists l ON l.id = p.list_id
         JOIN spaces s ON s.id = l.space_id JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = ?
         WHERE p.id = ?`
      )
      .get(req.user.id, req.params.id);
    if (!phase) return res.status(404).json({ error: '项目阶段不存在' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || phase.name : phase.name;
    const startDate = req.body?.start_date !== undefined ? String(req.body.start_date) : phase.start_date;
    const endDate = req.body?.end_date !== undefined ? String(req.body.end_date) : phase.end_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: '阶段日期无效' });
    }
    if (endDate < startDate) return res.status(400).json({ error: '阶段结束日期不能早于开始日期' });
    db.prepare(
      'UPDATE project_phases SET name = ?, start_date = ?, end_date = ?, color = ?, updated_at = ? WHERE id = ?'
    ).run(
      name,
      startDate,
      endDate,
      req.body?.color || phase.color,
      new Date().toISOString(),
      phase.id
    );
    res.json(db.prepare('SELECT * FROM project_phases WHERE id = ?').get(phase.id));
  });

  router.delete('/phases/:id', (req, res) => {
    const phase = db
      .prepare(
        `SELECT p.*, s.workspace_id FROM project_phases p JOIN lists l ON l.id = p.list_id
         JOIN spaces s ON s.id = l.space_id JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = ?
         WHERE p.id = ?`
      )
      .get(req.user.id, req.params.id);
    if (!phase) return res.status(404).json({ error: '项目阶段不存在' });
    db.prepare('DELETE FROM project_phases WHERE id = ?').run(phase.id);
    res.json({ ok: true });
  });

  router.get('/lists/:id/retrospectives', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const retrospectives = db
      .prepare(
        `SELECT r.*, u.name AS creator_name,
                (SELECT COUNT(*) FROM retrospective_tasks rt WHERE rt.retrospective_id = r.id) AS task_count,
                (SELECT COUNT(*) FROM retrospective_tasks rt WHERE rt.retrospective_id = r.id AND rt.kind = 'completed') AS completed_count,
                (SELECT COUNT(*) FROM retrospective_tasks rt WHERE rt.retrospective_id = r.id AND rt.kind = 'overdue') AS overdue_count
         FROM retrospectives r LEFT JOIN users u ON u.id = r.created_by
         WHERE r.list_id = ? ORDER BY r.created_at DESC`
      )
      .all(list.id);
    res.json({ retrospectives });
  });

  router.post('/lists/:id/retrospectives', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const existing = db.prepare('SELECT COUNT(*) AS c FROM retrospectives WHERE list_id = ?').get(list.id).c;
    const title =
      String(req.body?.title || '').trim() || `第 ${existing + 1} 次复盘 · ${todayStr()}`;
    const content = String(req.body?.content || '');
    const id = randomId();
    const now = new Date().toISOString();
    db.exec('BEGIN');
    let taskCount = 0;
    try {
      db.prepare(
        'INSERT INTO retrospectives (id, list_id, title, content, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
      ).run(id, list.id, title, content, req.user.id, now, now);
      taskCount = snapshotRetrospectiveTasks(db, list.id, id, now);
      logActivity(list.workspace_id, null, req.user.id, 'retrospective_created', `在「${list.name}」中发起复盘「${title}」`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const retrospective = db.prepare('SELECT * FROM retrospectives WHERE id = ?').get(id);
    const tasks = db
      .prepare('SELECT * FROM retrospective_tasks WHERE retrospective_id = ? ORDER BY event_date IS NULL, event_date, kind')
      .all(id);
    res.status(201).json({ ...retrospective, tasks, task_count: taskCount });
  });

  router.get('/retrospectives/:id', (req, res) => {
    const retrospective = accessibleRetrospective(req.params.id, req.user.id);
    if (!retrospective) return res.status(404).json({ error: '复盘不存在' });
    const tasks = db
      .prepare('SELECT * FROM retrospective_tasks WHERE retrospective_id = ? ORDER BY event_date IS NULL, event_date, kind')
      .all(retrospective.id);
    res.json({ ...retrospective, tasks });
  });

  router.patch('/retrospectives/:id', (req, res) => {
    const retrospective = accessibleRetrospective(req.params.id, req.user.id);
    if (!retrospective) return res.status(404).json({ error: '复盘不存在' });
    const title =
      req.body?.title !== undefined ? String(req.body.title).trim() || retrospective.title : retrospective.title;
    const content = req.body?.content !== undefined ? String(req.body.content) : retrospective.content;
    db.prepare('UPDATE retrospectives SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
      title,
      content,
      new Date().toISOString(),
      retrospective.id
    );
    res.json(db.prepare('SELECT * FROM retrospectives WHERE id = ?').get(retrospective.id));
  });

  router.delete('/retrospectives/:id', (req, res) => {
    const retrospective = accessibleRetrospective(req.params.id, req.user.id);
    if (!retrospective) return res.status(404).json({ error: '复盘不存在' });
    db.prepare('DELETE FROM retrospectives WHERE id = ?').run(retrospective.id);
    res.json({ ok: true });
  });

  router.post('/lists/:id/milestones', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '里程碑名称不能为空' });
    const dueDate = String(req.body?.due_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: '请选择里程碑日期' });
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), 0) AS max FROM milestones WHERE list_id = ?').get(list.id).max;
    const id = randomId();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO milestones (id, list_id, name, description, due_date, completed, color, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      list.id,
      name,
      String(req.body?.description || ''),
      dueDate,
      req.body?.completed ? 1 : 0,
      req.body?.color || list.color || '#7B68EE',
      maxOrder + 1,
      now,
      now
    );
    logActivity(list.workspace_id, null, req.user.id, 'milestone_created', `在「${list.name}」中新增里程碑「${name}」`);
    res.status(201).json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id));
  });

  router.patch('/milestones/:id', (req, res) => {
    const milestone = db
      .prepare(
        `SELECT m.*, s.workspace_id FROM milestones m JOIN lists l ON l.id = m.list_id
         JOIN spaces s ON s.id = l.space_id JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = ?
         WHERE m.id = ?`
      )
      .get(req.user.id, req.params.id);
    if (!milestone) return res.status(404).json({ error: '里程碑不存在' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim() || milestone.name : milestone.name;
    const dueDate = req.body?.due_date !== undefined ? String(req.body.due_date) : milestone.due_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: '里程碑日期无效' });
    db.prepare(
      'UPDATE milestones SET name = ?, description = ?, due_date = ?, completed = ?, color = ?, updated_at = ? WHERE id = ?'
    ).run(
      name,
      req.body?.description !== undefined ? String(req.body.description) : milestone.description,
      dueDate,
      req.body?.completed !== undefined ? (req.body.completed ? 1 : 0) : milestone.completed,
      req.body?.color || milestone.color,
      new Date().toISOString(),
      milestone.id
    );
    res.json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(milestone.id));
  });

  router.delete('/milestones/:id', (req, res) => {
    const milestone = db
      .prepare(
        `SELECT m.*, s.workspace_id FROM milestones m JOIN lists l ON l.id = m.list_id
         JOIN spaces s ON s.id = l.space_id JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = ?
         WHERE m.id = ?`
      )
      .get(req.user.id, req.params.id);
    if (!milestone) return res.status(404).json({ error: '里程碑不存在' });
    db.prepare('DELETE FROM milestones WHERE id = ?').run(milestone.id);
    res.json({ ok: true });
  });

  router.post('/lists/:id/templates', (req, res) => {
    const list = accessibleList(req.params.id, req.user.id);
    if (!list) return res.status(404).json({ error: '列表不存在' });
    const snapshot = buildTemplateSnapshot(list.id);
    if (!snapshot) return res.status(404).json({ error: '列表不存在' });
    const id = randomId();
    const now = new Date().toISOString();
    const name = String(req.body?.name || `${list.name}模板`).trim() || `${list.name}模板`;
    db.prepare(
      `INSERT INTO project_templates (id, workspace_id, name, icon, color, data, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(id, list.workspace_id, name, list.icon || '📋', list.color, JSON.stringify(snapshot), req.user.id, now, now);
    logActivity(list.workspace_id, null, req.user.id, 'template_created', `将项目「${list.name}」保存为模板「${name}」`);
    const template = db.prepare('SELECT id, name, icon, color, created_at, updated_at FROM project_templates WHERE id = ?').get(id);
    res.status(201).json(template);
  });

  router.delete('/templates/:id', (req, res) => {
    const template = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(req.params.id);
    if (!template || !workspaceRole(template.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '模板不存在' });
    }
    db.prepare('DELETE FROM project_templates WHERE id = ?').run(template.id);
    res.json({ ok: true });
  });

  router.post('/templates/:id/instantiate', (req, res) => {
    const template = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(req.params.id);
    if (!template || !workspaceRole(template.workspace_id, req.user.id)) {
      return res.status(404).json({ error: '模板不存在' });
    }
    const space = db
      .prepare('SELECT * FROM spaces WHERE id = ? AND workspace_id = ?')
      .get(req.body?.space_id, template.workspace_id);
    if (!space) return res.status(400).json({ error: '目标空间不存在' });
    let folderId = req.body?.folder_id || null;
    if (folderId) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND space_id = ?').get(folderId, space.id);
      if (!folder) folderId = null;
    }
    let data;
    try {
      data = JSON.parse(template.data || '{}');
    } catch {
      return res.status(400).json({ error: '模板数据已损坏' });
    }
    const listId = randomId();
    const now = new Date().toISOString();
    const projectName = String(req.body?.name || template.name).trim() || template.name;
    const listData = data.list || {};
    const statuses = Array.isArray(data.statuses) ? data.statuses : [];
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const taskTemplates = Array.isArray(data.tasks) ? data.tasks : [];
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];
    const phases = Array.isArray(data.phases) ? data.phases : [];
    db.exec('BEGIN');
    try {
      const count = db.prepare('SELECT COUNT(*) AS c FROM lists WHERE space_id = ?').get(space.id).c;
      db.prepare(
        `INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, purpose, order_index, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(
        listId,
        space.id,
        folderId,
        projectName,
        template.color || listData.color || '#7B68EE',
        template.icon || listData.icon || '📋',
        String(listData.description || ''),
        String(listData.purpose || ''),
        count,
        now
      );

      const statusMap = new Map();
      const statusSource = statuses.length ? statuses : DEFAULT_STATUSES.map(([name, color, type]) => ({ name, color, type }));
      statusSource.forEach((status, index) => {
        const statusId = randomId();
        db.prepare('INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)').run(
          statusId,
          listId,
          status.name,
          status.color || '#87909e',
          status.type || 'open',
          status.order_index ?? index
        );
        statusMap.set(status.name, { id: statusId, type: status.type || 'open' });
      });

      const fieldMap = new Map();
      fields.forEach((field, index) => {
        const fieldId = randomId();
        db.prepare('INSERT INTO custom_fields (id, list_id, name, type, options, order_index) VALUES (?,?,?,?,?,?)').run(
          fieldId,
          listId,
          field.name,
          field.type || 'text',
          JSON.stringify(Array.isArray(field.options) ? field.options : []),
          field.order_index ?? index
        );
        fieldMap.set(field.name, fieldId);
      });

      const tagMap = new Map();
      function ensureTag(tagName, tagColor) {
        if (!tagName) return null;
        if (tagMap.has(tagName)) return tagMap.get(tagName);
        let tag = db.prepare('SELECT * FROM tags WHERE workspace_id = ? AND lower(name) = lower(?)').get(template.workspace_id, tagName);
        if (!tag) {
          const tagId = randomId();
          db.prepare('INSERT INTO tags (id, workspace_id, name, color) VALUES (?,?,?,?)').run(
            tagId,
            template.workspace_id,
            tagName,
            tagColor || '#7B68EE'
          );
          tag = { id: tagId };
        }
        tagMap.set(tagName, tag.id);
        return tag.id;
      }

      const firstStatus = [...statusMap.values()][0];
      const taskIdByIndex = new Map();
      for (const task of taskTemplates) {
        const status = statusMap.get(task.status_name) || firstStatus;
        if (!status) continue;
        const parentId = task.parent_index !== null && task.parent_index !== undefined ? taskIdByIndex.get(task.parent_index) || null : null;
        if (task.parent_index !== null && task.parent_index !== undefined && !parentId) continue;
        const taskId = randomId();
        const assigneeId =
          task.assignee_id && isAssignable(template.workspace_id, task.assignee_id) ? task.assignee_id : null;
        const completedAt = ['done', 'closed'].includes(status.type) ? now : null;
        db.prepare(
          `INSERT INTO tasks (id, list_id, parent_id, name, description, status_id, priority, assignee_id, start_date, due_date, time_estimate, order_index, created_by, created_at, updated_at, completed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          taskId,
          listId,
          parentId,
          task.name,
          String(task.description || ''),
          status.id,
          Number(task.priority) || 0,
          assigneeId,
          dateFromDayOffset(task.start_offset),
          dateFromDayOffset(task.due_offset),
          null,
          Number(task.order_index) || 100,
          req.user.id,
          now,
          now,
          completedAt
        );
        taskIdByIndex.set(task.index, taskId);
        for (const tag of Array.isArray(task.tags) ? task.tags : []) {
          const tagId = ensureTag(tag.name, tag.color);
          if (tagId) db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?,?)').run(taskId, tagId);
        }
        for (const participantId of Array.isArray(task.participant_ids) ? task.participant_ids : []) {
          if (isAssignable(template.workspace_id, participantId)) {
            db.prepare('INSERT OR IGNORE INTO task_participants (task_id, user_id, created_at) VALUES (?,?,?)').run(
              taskId,
              participantId,
              now
            );
          }
        }
        if (task.field_values && typeof task.field_values === 'object') {
          for (const [fieldName, value] of Object.entries(task.field_values)) {
            const fieldId = fieldMap.get(fieldName);
            if (fieldId && value !== null && value !== '') {
              db.prepare('INSERT INTO task_field_values (task_id, field_id, value) VALUES (?,?,?)').run(taskId, fieldId, String(value));
            }
          }
        }
        for (const checklist of Array.isArray(task.checklists) ? task.checklists : []) {
          const checklistId = randomId();
          db.prepare('INSERT INTO checklists (id, task_id, name, order_index) VALUES (?,?,?,?)').run(
            checklistId,
            taskId,
            checklist.name || '检查清单',
            0
          );
          (Array.isArray(checklist.items) ? checklist.items : []).forEach((item, index) => {
            db.prepare('INSERT INTO checklist_items (id, checklist_id, name, done, order_index) VALUES (?,?,?,?,?)').run(
              randomId(),
              checklistId,
              item.name,
              item.done ? 1 : 0,
              index
            );
          });
        }
      }

      milestones.forEach((milestone, index) => {
        db.prepare(
          'INSERT INTO milestones (id, list_id, name, description, due_date, completed, color, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).run(
          randomId(),
          listId,
          milestone.name || '里程碑',
          String(milestone.description || ''),
          dateFromDayOffset(milestone.due_offset) || todayStr(14),
          milestone.completed ? 1 : 0,
          milestone.color || template.color || '#7B68EE',
          milestone.order_index ?? index,
          now,
          now
        );
      });

      phases.forEach((phase, index) => {
        db.prepare(
          'INSERT INTO project_phases (id, list_id, name, start_date, end_date, color, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
        ).run(
          randomId(),
          listId,
          phase.name || '项目阶段',
          dateFromDayOffset(phase.start_offset) || todayStr(0),
          dateFromDayOffset(phase.end_offset) || todayStr(30),
          phase.color || template.color || '#7B68EE',
          phase.order_index ?? index,
          now,
          now
        );
      });

      logActivity(template.workspace_id, null, req.user.id, 'list_created', `从模板「${template.name}」创建了项目「${projectName}」`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.status(201).json({
      list: accessibleList(listId, req.user.id),
      task_count: taskTemplates.length,
      milestone_count: milestones.length,
      phase_count: phases.length,
    });
  });

  router.post('/workspaces/:id/contacts', (req, res) => {
    const workspaceId = req.params.id;
    if (!workspaceRole(workspaceId, req.user.id)) return res.status(403).json({ error: '没有权限' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: '责任人姓名不能为空' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
    let user = email ? db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email) : null;
    if (!user && !email) {
      const existingMember = db
        .prepare(
          `SELECT u.* FROM workspace_members m JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = ? AND lower(u.name) = lower(?) LIMIT 1`
        )
        .get(workspaceId, name);
      if (existingMember) user = existingMember;
    }
    if (!user) {
      const existingContact = db
        .prepare(
          `SELECT u.* FROM workspace_contacts c JOIN users u ON u.id = c.user_id
           WHERE c.workspace_id = ? AND lower(u.name) = lower(?) LIMIT 1`
        )
        .get(workspaceId, name);
      if (existingContact) user = existingContact;
    }
    if (!user) {
      const id = randomId();
      const placeholderEmail = email || `external-${id.slice(0, 8)}@clickup.local`;
      const { hash, salt } = hashPassword(randomId());
      const colors = ['#7B68EE', '#4A9EFF', '#26C6DA', '#2EA44F', '#F59E0B', '#FF8A65', '#E5484D', '#A25DDC'];
      db.prepare(
        'INSERT INTO users (id, name, email, password_hash, password_salt, color, title, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(
        id,
        name,
        placeholderEmail,
        hash,
        salt,
        req.body?.color || colors[Math.floor(Math.random() * colors.length)],
        String(req.body?.title || '外部责任人'),
        new Date().toISOString()
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const alreadyContact = db
      .prepare('SELECT 1 FROM workspace_contacts WHERE workspace_id = ? AND user_id = ?')
      .get(workspaceId, user.id);
    const isMember = Boolean(workspaceRole(workspaceId, user.id));
    if (!alreadyContact && !isMember) {
      db.prepare('INSERT INTO workspace_contacts (workspace_id, user_id, created_at) VALUES (?,?,?)').run(
        workspaceId,
        user.id,
        new Date().toISOString()
      );
      logActivity(workspaceId, null, req.user.id, 'contact_added', `添加了外部责任人 ${user.name}`);
    }
    res.status(alreadyContact || isMember ? 200 : 201).json({
      ...publicUser(user),
      is_external: !isMember,
    });
  });

  router.delete('/workspaces/:id/contacts/:userId', (req, res) => {
    const workspaceId = req.params.id;
    if (!workspaceRole(workspaceId, req.user.id)) return res.status(403).json({ error: '没有权限' });
    const userId = req.params.userId;
    if (workspaceRole(workspaceId, userId)) {
      return res.status(400).json({ error: '该人员是团队成员，不能作为外部责任人移除' });
    }
    db.prepare('DELETE FROM workspace_contacts WHERE workspace_id = ? AND user_id = ?').run(workspaceId, userId);
    db.prepare(
      `UPDATE tasks SET assignee_id = NULL
       WHERE assignee_id = ? AND list_id IN (
         SELECT l.id FROM lists l JOIN spaces s ON s.id = l.space_id WHERE s.workspace_id = ?
       )`
    ).run(userId, workspaceId);
    db.prepare(
      `DELETE FROM task_participants
       WHERE user_id = ? AND task_id IN (
         SELECT t.id FROM tasks t JOIN lists l ON l.id = t.list_id JOIN spaces s ON s.id = l.space_id
         WHERE s.workspace_id = ?
       )`
    ).run(userId, workspaceId);
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
