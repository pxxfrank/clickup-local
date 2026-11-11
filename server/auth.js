import { getDb } from './db.js';
import { randomId, randomToken, verifyPassword, hashPassword } from './security.js';

const COOKIE_NAME = 'clickup_session';
const SESSION_DAYS = 30;

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function createSession(userId) {
  const db = getDb();
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(
    token,
    userId,
    now.toISOString(),
    expires.toISOString()
  );
  return token;
}

export function destroySession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    color: row.color,
    title: row.title || '',
    created_at: row.created_at,
  };
}

export function requireAuth(req, res, next) {
  const db = getDb();
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: '未登录' });
  const row = db
    .prepare(
      `SELECT u.*, s.token, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString());
  if (!row) {
    res.setHeader('Set-Cookie', clearCookie());
    return res.status(401).json({ error: '登录已过期' });
  }
  req.user = publicUser(row);
  req.sessionToken = token;
  next();
}

export function authRoutes(router) {
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: '邮箱或密码不正确' });
    }
    const token = createSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.json({ user: publicUser(user) });
  });

  router.post('/auth/register', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (name.length < 2) return res.status(400).json({ error: '请输入至少 2 个字符的姓名' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少需要 6 位' });
    const db = getDb();
    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
    if (exists) return res.status(409).json({ error: '该邮箱已注册，请直接登录' });

    const color = ['#7B68EE', '#26C6DA', '#FF8A65', '#66BB6A', '#EC407A'][Math.floor(Math.random() * 5)];
    const { hash, salt } = hashPassword(password);
    const userId = randomId();
    const workspaceId = randomId();
    const spaceId = randomId();
    const listId = randomId();
    const now = new Date().toISOString();
    const dbAny = db;
    dbAny.exec('BEGIN');
    try {
      dbAny
        .prepare(
          'INSERT INTO users (id, name, email, password_hash, password_salt, color, title, created_at) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(userId, name, email, hash, salt, color, '', now);
      dbAny.prepare('INSERT INTO workspaces (id, name, color, owner_id, created_at) VALUES (?,?,?,?,?)').run(
        workspaceId,
        `${name}的工作空间`,
        color,
        userId,
        now
      );
      dbAny
        .prepare('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?,?,?,?)')
        .run(workspaceId, userId, 'owner', now);
      dbAny
        .prepare(
          'INSERT INTO spaces (id, workspace_id, name, color, icon, is_private, order_index, created_at) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(spaceId, workspaceId, '我的项目', color, '🚀', 0, 0, now);
      dbAny
        .prepare(
          'INSERT INTO lists (id, space_id, folder_id, name, color, icon, description, order_index, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
        )
        .run(listId, spaceId, null, '任务清单', color, '📋', '从这里开始管理你的工作', 0, now);
      const defaultStatuses = [
        ['待处理', '#87909e', 'open'],
        ['进行中', '#4a9eff', 'active'],
        ['已完成', '#2ea44f', 'done'],
      ];
      const firstStatusId = randomId();
      defaultStatuses.forEach(([statusName, statusColor, type], index) => {
        const id = index === 0 ? firstStatusId : randomId();
        dbAny
          .prepare('INSERT INTO statuses (id, list_id, name, color, type, order_index) VALUES (?,?,?,?,?,?)')
          .run(id, listId, statusName, statusColor, type, index);
      });
      const taskId = randomId();
      dbAny
        .prepare(
          `INSERT INTO tasks (id, list_id, parent_id, name, description, status_id, priority, assignee_id, start_date, due_date, time_estimate, order_index, created_by, created_at, updated_at, completed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          taskId,
          listId,
          null,
          '欢迎使用 ClickUp 本地版 👋',
          '这是你的第一个任务。点击任务名称打开详情，试着修改状态、添加子任务或评论。\n\n你可以在左侧创建新的空间、文件夹和列表，也可以邀请团队成员一起协作。',
          firstStatusId,
          1,
          userId,
          null,
          null,
          null,
          1,
          userId,
          now,
          now,
          null
        );
      dbAny
        .prepare('INSERT INTO activity (id, workspace_id, task_id, user_id, type, message, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomId(), workspaceId, null, userId, 'workspace_created', '创建了工作空间', now);
      dbAny.exec('COMMIT');
    } catch (error) {
      dbAny.exec('ROLLBACK');
      throw error;
    }
    const token = createSession(userId);
    res.setHeader('Set-Cookie', sessionCookie(token));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/auth/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie || '');
    destroySession(cookies[COOKIE_NAME]);
    res.setHeader('Set-Cookie', clearCookie());
    res.json({ ok: true });
  });
}
