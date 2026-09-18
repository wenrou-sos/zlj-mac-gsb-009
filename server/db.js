// SQLite 数据访问层（better-sqlite3，同步 API）
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db;

export function openDb(filename = process.env.DB_PATH || 'data/app.db') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error('数据库未初始化');
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cranes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      x             REAL    NOT NULL,
      y             REAL    NOT NULL,
      jib_length    REAL    NOT NULL,
      height        REAL    NOT NULL DEFAULT 60,
      mast_radius   REAL    NOT NULL DEFAULT 1.6,
      swing_start   REAL    NOT NULL DEFAULT 0,
      swing_sweep   REAL    NOT NULL DEFAULT 360,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      crane_id      INTEGER NOT NULL REFERENCES cranes(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      start_time    TEXT    NOT NULL,
      end_time      TEXT    NOT NULL,
      hook_height   REAL    NOT NULL DEFAULT 20,
      load_weight   REAL    NOT NULL DEFAULT 0,
      path_json     TEXT    NOT NULL DEFAULT '[]',
      note          TEXT    NOT NULL DEFAULT '',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
}

// ---------- cranes ----------
const rowToCrane = (r) => ({
  id: r.id,
  name: r.name,
  x: r.x,
  y: r.y,
  jib_length: r.jib_length,
  height: r.height,
  mast_radius: r.mast_radius,
  swing_start: r.swing_start,
  swing_sweep: r.swing_sweep,
  created_at: r.created_at,
});

export function listCranes() {
  return getDb().prepare('SELECT * FROM cranes ORDER BY id').all().map(rowToCrane);
}

export function createCrane(input) {
  const info = getDb()
    .prepare(
      `INSERT INTO cranes (name, x, y, jib_length, height, mast_radius, swing_start, swing_sweep)
       VALUES (@name, @x, @y, @jib_length, @height, @mast_radius, @swing_start, @swing_sweep)`,
    )
    .run(input);
  return getDb().prepare('SELECT * FROM cranes WHERE id = ?').get(info.lastInsertRowid);
}

export function updateCrane(id, input) {
  const fields = ['name', 'x', 'y', 'jib_length', 'height', 'mast_radius', 'swing_start', 'swing_sweep'];
  const sets = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb().prepare(`UPDATE cranes SET ${sets} WHERE id = @id`).run({ ...input, id });
  return getDb().prepare('SELECT * FROM cranes WHERE id = ?').get(id);
}

export function deleteCrane(id) {
  return getDb().prepare('DELETE FROM cranes WHERE id = ?').run(id).changes > 0;
}

// ---------- tasks ----------
const rowToTask = (r) => ({
  id: r.id,
  crane_id: r.crane_id,
  name: r.name,
  start_time: r.start_time,
  end_time: r.end_time,
  hook_height: r.hook_height,
  load_weight: r.load_weight,
  path: safeParse(r.path_json),
  note: r.note,
  created_at: r.created_at,
});

function safeParse(s) {
  try {
    return JSON.parse(s || '[]');
  } catch {
    return [];
  }
}

export function listTasks() {
  return getDb().prepare('SELECT * FROM tasks ORDER BY start_time, id').all().map(rowToTask);
}

export function createTask(input) {
  const info = getDb()
    .prepare(
      `INSERT INTO tasks (crane_id, name, start_time, end_time, hook_height, load_weight, path_json, note)
       VALUES (@crane_id, @name, @start_time, @end_time, @hook_height, @load_weight, @path_json, @note)`,
    )
    .run({ ...input, path_json: JSON.stringify(input.path ?? []) });
  return rowToTask(getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
}

export function updateTask(id, input) {
  const fields = ['crane_id', 'name', 'start_time', 'end_time', 'hook_height', 'load_weight', 'note'];
  const sets = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb()
    .prepare(`UPDATE tasks SET ${sets}, path_json = @path_json WHERE id = @id`)
    .run({ ...input, id, path_json: JSON.stringify(input.path ?? []) });
  return rowToTask(getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id));
}

export function deleteTask(id) {
  return getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

export function resetAll() {
  getDb().exec('DELETE FROM tasks; DELETE FROM cranes;');
}
