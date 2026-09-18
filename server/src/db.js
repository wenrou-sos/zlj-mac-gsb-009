import initSqlJs from 'sql.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');

let db;
let dbPath;
let saveTimer = null;

/** 打开（或创建）SQLite 数据库文件；首次为空库时执行建表 */
export async function openDb(filePath = process.env.DB_PATH || './data/crane.db') {
  const SQL = await initSqlJs({ locateFile: () => WASM });
  dbPath = filePath;
  if (dirname(filePath) !== '.') mkdirSync(dirname(filePath), { recursive: true });
  db = existsSync(filePath) ? new SQL.Database(readFileSync(filePath)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  migrate();
  saveNow();
  return db;
}

export function getDb() {
  if (!db) throw new Error('数据库尚未初始化，请先 await openDb()');
  return db;
}

/** 立即把内存数据库写回文件 */
export function saveNow() {
  if (!db || !dbPath) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeFileSync(dbPath, Buffer.from(db.export()));
}

/** 关闭数据库（落盘并释放） */
export function closeDb() {
  saveNow();
  if (db) db.close();
  db = null;
}

/** 防抖落盘（高频写入时合并 IO） */
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 100);
}

export function migrate() {
  getDb().run(`
    CREATE TABLE IF NOT EXISTS cranes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      max_radius REAL NOT NULL,
      min_radius REAL NOT NULL DEFAULT 4,
      bearing REAL NOT NULL DEFAULT 0,
      sweep REAL NOT NULL DEFAULT 360,
      jib_height REAL NOT NULL,
      color TEXT NOT NULL DEFAULT '#38bdf8'
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crane_id INTEGER NOT NULL REFERENCES cranes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      lift_height REAL NOT NULL DEFAULT 20,
      jib_start REAL NOT NULL DEFAULT 0,
      jib_end REAL NOT NULL DEFAULT 0,
      path TEXT NOT NULL
    );
  `);
}

/** 统一封装：sql.js 语句执行后立即释放，并在写操作后落盘 */
function stmtAll(sql, params = []) {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function stmtGet(sql, params = []) {
  return stmtAll(sql, params)[0] ?? null;
}

function stmtRun(sql, params = []) {
  getDb().run(sql, params);
  scheduleSave();
  return { lastInsertRowid: getDb().exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] };
}

export function mapCrane(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    maxRadius: row.max_radius,
    minRadius: row.min_radius,
    bearing: row.bearing,
    sweep: row.sweep,
    jibHeight: row.jib_height,
    color: row.color,
  };
}

export function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    craneId: row.crane_id,
    name: row.name,
    start: row.start,
    end: row.end,
    liftHeight: row.lift_height,
    jibStart: row.jib_start,
    jibEnd: row.jib_end,
    path: JSON.parse(row.path),
  };
}

export const listCranes = () => stmtAll('SELECT * FROM cranes ORDER BY id').map(mapCrane);
export const listTasks = () => stmtAll('SELECT * FROM tasks ORDER BY id').map(mapTask);
export const getCraneRow = (id) => stmtGet('SELECT * FROM cranes WHERE id = ?', [Number(id)]);
export const getTaskRow = (id) => stmtGet('SELECT * FROM tasks WHERE id = ?', [Number(id)]);

export function insertCrane(c) {
  stmtRun(
    `INSERT INTO cranes (name, x, y, max_radius, min_radius, bearing, sweep, jib_height, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.name, Number(c.x), Number(c.y), Number(c.maxRadius), Number(c.minRadius ?? 4),
      Number(c.bearing ?? 0), Number(c.sweep ?? 360), Number(c.jibHeight), c.color || '#38bdf8',
    ]
  );
  return mapCrane(stmtGet('SELECT * FROM cranes ORDER BY id DESC LIMIT 1'));
}

export function updateCrane(id, c) {
  stmtRun(
    `UPDATE cranes SET name=?, x=?, y=?, max_radius=?, min_radius=?, bearing=?, sweep=?, jib_height=?, color=? WHERE id=?`,
    [
      c.name, Number(c.x), Number(c.y), Number(c.maxRadius), Number(c.minRadius ?? 4),
      Number(c.bearing ?? 0), Number(c.sweep ?? 360), Number(c.jibHeight), c.color || '#38bdf8', Number(id),
    ]
  );
  return mapCrane(stmtGet('SELECT * FROM cranes WHERE id = ?', [Number(id)]));
}

export function deleteCrane(id) {
  stmtRun('DELETE FROM tasks WHERE crane_id = ?', [Number(id)]);
  stmtRun('DELETE FROM cranes WHERE id = ?', [Number(id)]);
}

export function insertTask(t) {
  stmtRun(
    `INSERT INTO tasks (crane_id, name, start, end, lift_height, jib_start, jib_end, path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(t.craneId), t.name, t.start, t.end, Number(t.liftHeight ?? 20),
      Number(t.jibStart ?? 0), Number(t.jibEnd ?? 0), JSON.stringify(t.path || []),
    ]
  );
  return mapTask(stmtGet('SELECT * FROM tasks ORDER BY id DESC LIMIT 1'));
}

export function updateTask(id, t) {
  stmtRun(
    `UPDATE tasks SET crane_id=?, name=?, start=?, end=?, lift_height=?, jib_start=?, jib_end=?, path=? WHERE id=?`,
    [
      Number(t.craneId), t.name, t.start, t.end, Number(t.liftHeight ?? 20),
      Number(t.jibStart ?? 0), Number(t.jibEnd ?? 0), JSON.stringify(t.path || []), Number(id),
    ]
  );
  return mapTask(stmtGet('SELECT * FROM tasks WHERE id = ?', [Number(id)]));
}

export function deleteTask(id) {
  stmtRun('DELETE FROM tasks WHERE id = ?', [Number(id)]);
}
