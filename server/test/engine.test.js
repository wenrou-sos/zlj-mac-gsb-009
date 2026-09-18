import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSchedule, findFeasibleStart, liveHazards } from '../src/engine.js';
import { toHHMM as toHHMM_ } from '../src/geometry.js';

const cranesAB = (overA = {}, overB = {}) => [
  { id: 1, name: 'A吊', x: 0, y: 0, maxRadius: 50, minRadius: 4, bearing: 0, sweep: 360, jibHeight: 40, color: '#000', ...overA },
  { id: 2, name: 'B吊', x: 60, y: 0, maxRadius: 50, minRadius: 4, bearing: 180, sweep: 360, jibHeight: 40, color: '#fff', ...overB },
];

const types = (report) => report.conflicts.map((c) => c.type).sort();

describe('静态臂架冲突', () => {
  test('回转范围重叠且高差不足 -> jib_overlap，高差足够则不报', () => {
    const low = analyzeSchedule(cranesAB(), []);
    assert.ok(low.conflicts.some((c) => c.type === 'jib_overlap'));

    const stepped = analyzeSchedule(cranesAB({ jibHeight: 40 }, { jibHeight: 45 }), []);
    assert.ok(!stepped.conflicts.some((c) => c.type === 'jib_overlap'), '高差 5m ≥ 净空 3m');
  });

  test('建议包含抬升臂架与限制回转', () => {
    const { conflicts } = analyzeSchedule(cranesAB(), []);
    const actions = conflicts[0].suggestions.map((s) => s.action);
    assert.ok(actions.includes('raise_jib'));
    assert.ok(actions.includes('limit_slew'));
  });
});

describe('同机时间冲突', () => {
  test('同一塔吊任务时段重叠 -> schedule_overlap', () => {
    const cranes = cranesAB();
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 30, jibStart: 0, jibEnd: 90, path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      { id: 2, craneId: 1, name: 't2', start: '09:30', end: '10:30', liftHeight: 30, jibStart: 0, jibEnd: 90, path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    ];
    const report = analyzeSchedule(cranes, tasks);
    assert.ok(report.conflicts.some((c) => c.type === 'schedule_overlap'));
  });

  test('不重叠的任务无冲突并给出顺延建议', () => {
    const cranes = cranesAB();
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '09:30', liftHeight: 30, jibStart: 0, jibEnd: 90, path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      { id: 2, craneId: 1, name: 't2', start: '10:00', end: '10:30', liftHeight: 30, jibStart: 0, jibEnd: 90, path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    ];
    assert.equal(analyzeSchedule(cranes, tasks).conflicts.filter((c) => c.type === 'schedule_overlap').length, 0);

    const feasible = findFeasibleStart(tasks[1], cranes, tasks);
    assert.ok(feasible === null || feasible >= 9 * 60, '不早于原计划或当天无解');
  });
});

describe('跨机动态冲突', () => {
  test('吊重在同一时刻同一点交会且高差不足 -> load_load', () => {
    const cranes = cranesAB({ jibHeight: 40 }, { jibHeight: 45 }); // 静态无冲突
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 20, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 50, y: 0 }] },
      { id: 2, craneId: 2, name: 't2', start: '09:00', end: '10:00', liftHeight: 21, jibStart: 270, jibEnd: 270, path: [{ x: 50, y: 0 }, { x: 10, y: 0 }] },
    ];
    const report = analyzeSchedule(cranes, tasks);
    assert.ok(report.conflicts.some((c) => c.type === 'load_load'));
  });

  test('错层吊装（高差 ≥ 2m）后不再相撞', () => {
    const cranes = cranesAB({ jibHeight: 40 }, { jibHeight: 45 });
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 20, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 50, y: 0 }] },
      { id: 2, craneId: 2, name: 't2', start: '09:00', end: '10:00', liftHeight: 25, jibStart: 270, jibEnd: 270, path: [{ x: 50, y: 0 }, { x: 10, y: 0 }] },
    ];
    assert.ok(!analyzeSchedule(cranes, tasks).conflicts.some((c) => c.type === 'load_load'));
  });

  test('吊重从另一台臂架下方穿过 -> load_jib', () => {
    const cranes = cranesAB({ x: 0, y: 0, jibHeight: 30 }, { x: 80, y: 0, jibHeight: 40 });
    // B 的臂架恒定朝西（270°），臂段覆盖 (30,0)~(76,0)；A 的吊重高度 39m 从其臂架下方穿过
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '09:40', liftHeight: 39, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 45, y: 0 }] },
      { id: 2, craneId: 2, name: 't2', start: '09:00', end: '09:40', liftHeight: 38, jibStart: 270, jibEnd: 270, path: [{ x: 70, y: 20 }, { x: 70, y: -20 }] },
    ];
    const report = analyzeSchedule(cranes, tasks);
    assert.ok(report.conflicts.some((c) => c.type === 'load_jib'), `实际: ${JSON.stringify(types(report))}`);
  });

  test('吊重路径穿越另一台塔身 -> load_tower', () => {
    const cranes = cranesAB({ x: 0, y: 0, jibHeight: 50 }, { x: 80, y: 0, jibHeight: 55 });
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 20, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 78, y: 0 }] },
    ];
    const report = analyzeSchedule(cranes, tasks);
    assert.ok(report.conflicts.some((c) => c.type === 'load_tower'));
  });

  test('顺延改期建议可以消除 load_load', () => {
    const cranes = cranesAB({ jibHeight: 40 }, { jibHeight: 45 });
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 20, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 50, y: 0 }] },
      { id: 2, craneId: 2, name: 't2', start: '09:00', end: '10:00', liftHeight: 21, jibStart: 270, jibEnd: 270, path: [{ x: 50, y: 0 }, { x: 10, y: 0 }] },
    ];
    const start = findFeasibleStart(tasks[1], cranes, tasks);
    assert.ok(start >= 10 * 60, '顺延开始时间不早于 10:00');
    const shifted = { ...tasks[1], start: toHHMM_(start), end: toHHMM_(start + 60) };
    assert.ok(!analyzeSchedule(cranes, [tasks[0], shifted]).conflicts.some((c) => c.type === 'load_load'));
  });
});

describe('实时预演', () => {
  test('碰撞时刻 liveHazards 标记危险点，错峰后无危险', () => {
    const cranes = cranesAB({ jibHeight: 40 }, { jibHeight: 45 });
    const tasks = [
      { id: 1, craneId: 1, name: 't1', start: '09:00', end: '10:00', liftHeight: 20, jibStart: 90, jibEnd: 90, path: [{ x: 10, y: 0 }, { x: 50, y: 0 }] },
      { id: 2, craneId: 2, name: 't2', start: '09:00', end: '10:00', liftHeight: 21, jibStart: 270, jibEnd: 270, path: [{ x: 50, y: 0 }, { x: 10, y: 0 }] },
    ];
    const hit = liveHazards(cranes, tasks, 9 * 60 + 30);
    assert.equal(hit.hazards.length, 1);
    assert.deepEqual(hit.hazards[0], { type: 'load_load', x: 30, y: 0, taskIds: [1, 2] });

    const quiet = liveHazards(cranes, tasks, 8 * 60);
    assert.equal(quiet.hazards.length, 0);
    assert.equal(quiet.activeTaskIds.length, 0);
  });
});
