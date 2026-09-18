// 演示数据：3 台塔吊 + 4 个吊装任务
// 刻意构造：①1号/3号臂架高差不足且扇区重叠 ②3号机 T3/T4 时段重叠 ③T1/T3 吊重 09:28 在 (52,52) 相撞
import { getDb, saveNow } from './db.js';

export function seedData(db = getDb()) {
  db.run('DELETE FROM tasks;');
  db.run('DELETE FROM cranes;');

  const cranes = [
    { name: '1号塔吊', x: 30, y: 25, max_radius: 45, min_radius: 4, bearing: 90, sweep: 360, jib_height: 30, color: '#38bdf8' },
    { name: '2号塔吊', x: 85, y: 30, max_radius: 40, min_radius: 4, bearing: 270, sweep: 360, jib_height: 38, color: '#34d399' },
    { name: '3号塔吊', x: 60, y: 70, max_radius: 30, min_radius: 4, bearing: 0, sweep: 220, jib_height: 29, color: '#fbbf24' },
  ];
  const insertC = db.prepare(
    `INSERT INTO cranes (name, x, y, max_radius, min_radius, bearing, sweep, jib_height, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const runC = (c) => insertC.run([c.name, c.x, c.y, c.max_radius, c.min_radius, c.bearing, c.sweep, c.jib_height, c.color]);
  runC(cranes[0]);
  const c1 = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  runC(cranes[1]);
  const c2 = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  runC(cranes[2]);
  const c3 = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  insertC.free();

  const tasks = [
    {
      crane_id: c1,
      name: 'T1 钢梁吊装',
      start: '09:00',
      end: '09:40',
      lift_height: 18,
      jib_start: 144,
      jib_end: 140,
      // 09:28（t=0.7）吊重到达 (52,52)
      path: [
        { x: 42.7, y: 42.7 },
        { x: 56, y: 56 },
      ],
    },
    {
      crane_id: c2,
      name: 'T2 模板转运',
      start: '08:30',
      end: '09:20',
      lift_height: 26,
      jib_start: 240,
      jib_end: 120,
      path: [
        { x: 105, y: 20 },
        { x: 85, y: 15 },
        { x: 70, y: 40 },
      ],
    },
    {
      crane_id: c3,
      name: 'T3 钢筋吊运',
      start: '09:00',
      end: '09:40',
      lift_height: 17,
      jib_start: 66,
      jib_end: 316,
      // 09:28（t=0.7）吊重同样到达 (52,52)，与 T1 相撞（高差仅 1m）
      path: [
        { x: 82, y: 60 },
        { x: 39.1, y: 48.6 },
      ],
    },
    {
      crane_id: c3,
      name: 'T4 设备进场',
      start: '09:30',
      end: '10:10',
      lift_height: 20,
      jib_start: 100,
      jib_end: 300,
      path: [
        { x: 45, y: 65 },
        { x: 60, y: 70 },
        { x: 80, y: 75 },
      ],
    },
  ];
  const insertT = db.prepare(
    `INSERT INTO tasks (crane_id, name, start, "end", lift_height, jib_start, jib_end, path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const t of tasks) {
    insertT.run([t.crane_id, t.name, t.start, t.end, t.lift_height, t.jib_start, t.jib_end, JSON.stringify(t.path)]);
  }
  insertT.free();

  saveNow();
  return { craneIds: [c1, c2, c3] };
}
