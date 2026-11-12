import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDatabase } from './seed.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const DATA_DIR = process.env.CLICKUP_DATA_DIR
  ? path.resolve(process.env.CLICKUP_DATA_DIR)
  : path.join(ROOT, 'data');

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  avatar TEXT,
  title TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_contacts (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  icon TEXT DEFAULT '🚀',
  is_private INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  icon TEXT DEFAULT '📋',
  description TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'open',
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  assignee_id TEXT,
  start_date TEXT,
  due_date TEXT,
  time_estimate INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  color TEXT NOT NULL DEFAULT '#7B68EE',
  data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS brainstorm_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_phases (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7B68EE',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retrospectives (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS retrospective_tasks (
  id TEXT PRIMARY KEY,
  retrospective_id TEXT NOT NULL,
  task_id TEXT,
  name TEXT NOT NULL,
  status_name TEXT,
  status_color TEXT,
  status_type TEXT,
  assignee_name TEXT,
  due_date TEXT,
  completed_at TEXT,
  event_date TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (retrospective_id) REFERENCES retrospectives(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_participants (
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_config TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  name TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  options TEXT DEFAULT '[]',
  order_index INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_field_values (
  task_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (task_id, field_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_reads (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_id);
CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_list ON brainstorm_items(list_id);
CREATE INDEX IF NOT EXISTS idx_milestones_list ON milestones(list_id);
CREATE INDEX IF NOT EXISTS idx_participants_task ON task_participants(task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_dep ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_automations_list ON automation_rules(list_id);
CREATE INDEX IF NOT EXISTS idx_phases_list ON project_phases(list_id);
CREATE INDEX IF NOT EXISTS idx_retrospectives_list ON retrospectives(list_id);
CREATE INDEX IF NOT EXISTS idx_retrospective_tasks ON retrospective_tasks(retrospective_id);
CREATE INDEX IF NOT EXISTS idx_templates_workspace ON project_templates(workspace_id);
`;

let database = null;

export function getDb() {
  if (database) return database;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  database = new DatabaseSync(path.join(DATA_DIR, 'clickup.db'));
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(SCHEMA);
  // Lightweight migrations for databases created by older versions.
  const listColumns = database.prepare('PRAGMA table_info(lists)').all();
  if (!listColumns.some((column) => column.name === 'purpose')) {
    database.exec("ALTER TABLE lists ADD COLUMN purpose TEXT DEFAULT ''");
  }
  const taskColumns = database.prepare('PRAGMA table_info(tasks)').all();
  if (!taskColumns.some((column) => column.name === 'recurrence_frequency')) {
    database.exec("ALTER TABLE tasks ADD COLUMN recurrence_frequency TEXT DEFAULT 'none'");
  }
  if (!taskColumns.some((column) => column.name === 'recurrence_interval')) {
    database.exec('ALTER TABLE tasks ADD COLUMN recurrence_interval INTEGER DEFAULT 1');
  }
  if (!taskColumns.some((column) => column.name === 'recurrence_until')) {
    database.exec('ALTER TABLE tasks ADD COLUMN recurrence_until TEXT');
  }
  const row = database.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (!row || row.count === 0) {
    seedDatabase(database);
  }
  // Drop expired sessions on boot.
  database.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  return database;
}

export function closeDb() {
  if (!database) return;
  try {
    database.close();
  } catch {
    // Ignore a close failure; reopening will still validate the file.
  }
  database = null;
}

function backupInfo(name) {
  const fullPath = path.join(BACKUP_DIR, name);
  const stat = fs.statSync(fullPath);
  const stamp = name.match(/^clickup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/);
  const created_at = stamp
    ? `${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}.${stamp[5]}Z`
    : stat.mtime.toISOString();
  return {
    name,
    size: stat.size,
    created_at,
    kind: name.includes('-auto.db') ? 'auto' : name.includes('-before-restore.db') ? 'safety' : 'manual',
  };
}

export function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.db'))
    .map((name) => backupInfo(name))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function backupPath(name) {
  const safe = path.basename(String(name || ''));
  if (safe !== name || !/^clickup-[A-Za-z0-9._-]+\.db$/.test(safe)) {
    throw new Error('备份文件名无效');
  }
  const fullPath = path.join(BACKUP_DIR, safe);
  if (!fullPath.startsWith(`${BACKUP_DIR}${path.sep}`) || !fs.existsSync(fullPath)) {
    throw new Error('备份不存在');
  }
  return fullPath;
}

function pruneBackups(keep = 30) {
  const files = listBackups();
  for (const file of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    } catch {
      // Ignore cleanup failures.
    }
  }
}

export function createBackup(kind = 'manual') {
  const db = getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  try {
    db.exec('PRAGMA wal_checkpoint(FULL)');
  } catch {
    // A checkpoint failure should not block copying the main database file.
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `clickup-${stamp}-${kind}.db`;
  fs.copyFileSync(path.join(DATA_DIR, 'clickup.db'), path.join(BACKUP_DIR, name));
  pruneBackups();
  return backupInfo(name);
}

export function deleteBackup(name) {
  const fullPath = backupPath(name);
  fs.unlinkSync(fullPath);
  return { ok: true };
}

export function getBackupPath(name) {
  return backupPath(name);
}

function validateBackupFile(fullPath) {
  const probe = new DatabaseSync(fullPath);
  try {
    const integrity = probe.prepare('PRAGMA integrity_check').get();
    const result = integrity ? Object.values(integrity)[0] : null;
    if (result !== 'ok') throw new Error('备份文件完整性校验失败');
    probe.prepare('SELECT COUNT(*) AS count FROM users').get();
    probe.prepare('SELECT COUNT(*) AS count FROM workspaces').get();
  } finally {
    probe.close();
  }
}

export function restoreBackup(name) {
  const source = backupPath(name);
  validateBackupFile(source);
  const safety = createBackup('before-restore');
  closeDb();
  try {
    fs.copyFileSync(source, path.join(DATA_DIR, 'clickup.db'));
    for (const suffix of ['-wal', '-shm']) {
      const file = path.join(DATA_DIR, `clickup.db${suffix}`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    const restoredDb = getDb();
    return { backup: backupInfo(name), safety, db: restoredDb };
  } catch (error) {
    closeDb();
    try {
      fs.copyFileSync(path.join(BACKUP_DIR, safety.name), path.join(DATA_DIR, 'clickup.db'));
      getDb();
    } catch {
      // The caller will report the original restore error.
    }
    throw error;
  }
}
