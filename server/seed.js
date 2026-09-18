// 首次启动的演示数据：覆盖五类冲突场景
import { minutesFromNow } from '../shared/time.js';
import * as db from './db.js';

export function seedIfEmpty() {
  const database = db.getDb();
  const count = database.prepare('SELECT COUNT(*) AS n FROM cranes').get().n;
  if (count > 0) return;

  const t = (start, end) => ({ start_time: minutesFromNow(start), end_time: minutesFromNow(end) });

  // 群塔布置：
  // 1# ↔ 2#：塔心距约 70m，全回转、同高，臂长相交
  const c1 = db.createCrane({ name: '1#塔吊', x: 120, y: 180, jib_length: 55, height: 65, mast_radius: 1.6, swing_start: 0, swing_sweep: 360 });
  const c2 = db.createCrane({ name: '2#塔吊', x: 210, y: 130, jib_length: 50, height: 65, mast_radius: 1.6, swing_start: 0, swing_sweep: 360 });
  // 3# 更高，做高位立体避让示范
  const c3 = db.createCrane({ name: '3#塔吊', x: 300, y: 220, jib_length: 45, height: 74, mast_radius: 1.6, swing_start: 180, swing_sweep: 180 });
  // 4# 距 1# 仅 40m 且全回转 50m 臂 -> 大臂扫塔场景
  const c4 = db.createCrane({ name: '4#塔吊', x: 90, y: 215, jib_length: 50, height: 65, mast_radius: 1.6, swing_start: 0, swing_sweep: 360 });

  db.createTask({
    crane_id: c1.id,
    name: 'A区钢梁吊装',
    ...t(0, 120),
    hook_height: 30,
    load_weight: 4.2,
    path: [
      { x: 120, y: 180 },
      { x: 160, y: 120 },
      { x: 230, y: 90 },
    ],
    note: '与2#塔吊作业面交叉',
  });

  db.createTask({
    crane_id: c2.id,
    name: 'B区模板吊运',
    ...t(60, 180),
    hook_height: 30,
    load_weight: 2.0,
    path: [
      { x: 210, y: 130 },
      { x: 260, y: 110 },
      { x: 200, y: 60 },
    ],
    note: '',
  });

  db.createTask({
    crane_id: c2.id,
    name: 'B区钢筋二次倒运',
    ...t(90, 150),
    hook_height: 26,
    load_weight: 1.5,
    path: [
      { x: 210, y: 130 },
      { x: 170, y: 170 },
    ],
    note: '与模板任务同机重叠（调度冲突示例）',
  });

  db.createTask({
    crane_id: c3.id,
    name: 'C区设备吊装（高位）',
    ...t(30, 150),
    hook_height: 52,
    load_weight: 6.0,
    path: [
      { x: 300, y: 220 },
      { x: 235, y: 175 },
      { x: 330, y: 150 },
    ],
    note: '高位塔吊，与下方作业立体交叉',
  });

  db.createTask({
    crane_id: c4.id,
    name: 'D区材料转运',
    ...t(200, 280),
    hook_height: 28,
    load_weight: 1.0,
    path: [
      { x: 90, y: 215 },
      { x: 60, y: 260 },
    ],
    note: '时段与1#错开，演示静态臂幅隐患',
  });
}
