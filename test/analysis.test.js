import { describe, it, expect } from 'vitest';
import { analyze } from '../server/analysis.js';
import { CONFLICT_TYPE, SEVERITY, ACTION_TYPE } from '../shared/constants.js';
import { minutesFromNow } from '../shared/time.js';

const baseCrane = (over = {}) => ({
  id: 1,
  name: '1#',
  x: 0,
  y: 0,
  jib_length: 50,
  height: 60,
  mast_radius: 1.6,
  swing_start: 0,
  swing_sweep: 360,
  ...over,
});

const baseTask = (over = {}) => ({
  id: 1,
  crane_id: 1,
  name: '任务',
  start_time: minutesFromNow(0),
  end_time: minutesFromNow(60),
  hook_height: 20,
  load_weight: 1,
  path: [],
  note: '',
  ...over,
});

const find = (conflicts, type) => conflicts.filter((c) => c.type === type);

describe('大臂扫塔（mast-hit）', () => {
  it('全回转长臂覆盖邻机塔身 -> 高危且建议限幅', () => {
    const cranes = [
      baseCrane(),
      baseCrane({ id: 2, name: '2#', x: 40, y: 0 }),
    ];
    const { conflicts } = analyze(cranes, []);
    const hits = find(conflicts, CONFLICT_TYPE.MAST_HIT);
    // 双向扫塔各报一次
    expect(hits.length).toBe(2);
    expect(hits.every((h) => h.severity === SEVERITY.HIGH)).toBe(true);
    const limit = hits.flatMap((h) => h.suggestions).find((s) => s.action?.type === ACTION_TYPE.LIMIT_SWING);
    expect(limit).toBeTruthy();
    // 限幅后臂长 < 塔心距 - 塔身半径
    expect(limit.action.jib_length).toBeLessThan(40 - 1.6);
  });

  it('高塔大臂越过低塔时不判扫塔（反向矮塔臂够不到高塔塔身）', () => {
    const cranes = [
      baseCrane({ height: 80 }),
      baseCrane({ id: 2, x: 40, y: 0, height: 60, jib_length: 30 }),
    ];
    const { conflicts } = analyze(cranes, []);
    expect(find(conflicts, CONFLICT_TYPE.MAST_HIT)).toHaveLength(0);
  });

  it('限幅建议应用后冲突消除', () => {
    const cranes = [
      baseCrane(),
      baseCrane({ id: 2, x: 40, y: 0 }),
    ];
    const first = analyze(cranes, []).conflicts.find((c) => c.type === CONFLICT_TYPE.MAST_HIT && c.crane_a_id === 1);
    const limited = { ...cranes[0], jib_length: first.suggestions[0].action.jib_length };
    const again = analyze([limited, cranes[1]], []).conflicts;
    // 1# 不再扫 2# 塔身（2# 仍可能扫 1#）
    expect(again.find((c) => c.type === CONFLICT_TYPE.MAST_HIT && c.crane_a_id === 1)).toBeFalsy();
  });
});

describe('大臂空间重叠（jib-overlap）', () => {
  const cranes = () => [
    baseCrane({ id: 1, x: 0, y: 0, jib_length: 50, height: 60 }),
    baseCrane({ id: 2, x: 70, y: 0, jib_length: 50, height: 60 }),
  ];

  it('同高 + 扇区重叠 + 任务时段与吊钩高度重合 -> 高危', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1 }),
      baseTask({ id: 2, crane_id: 2 }),
    ];
    const { conflicts } = analyze(cranes(), tasks);
    const hit = find(conflicts, CONFLICT_TYPE.JIB_OVERLAP).find((c) => c.severity === SEVERITY.HIGH);
    expect(hit).toBeTruthy();
    expect(hit.suggestions[0].action.type).toBe(ACTION_TYPE.SHIFT_TASK);
  });

  it('同高同空间但时段完全错开 -> 中危静态隐患', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1, start_time: minutesFromNow(0), end_time: minutesFromNow(60) }),
      baseTask({ id: 2, crane_id: 2, start_time: minutesFromNow(60), end_time: minutesFromNow(120) }),
    ];
    const { conflicts } = analyze(cranes(), tasks);
    const staticHit = find(conflicts, CONFLICT_TYPE.JIB_OVERLAP).find((c) => c.severity === SEVERITY.MEDIUM);
    expect(staticHit).toBeTruthy();
  });

  it('臂顶高差足够时不重叠', () => {
    const list = [baseCrane({ id: 1, height: 60 }), baseCrane({ id: 2, x: 70, y: 0, height: 70 })];
    const { conflicts } = analyze(list, []);
    expect(find(conflicts, CONFLICT_TYPE.JIB_OVERLAP)).toHaveLength(0);
  });
});

describe('吊载路径交叉（path-cross）', () => {
  const cranes = [
    baseCrane({ id: 1, x: 0, y: 0 }),
    baseCrane({ id: 2, x: 200, y: 200 }), // 塔身远离路径，只测路径互相关系
  ];

  it('路径近、同时段、同高度 -> 高危，含错峰与抬钩两条建议', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1, path: [{ x: 40, y: 40 }, { x: 120, y: 40 }] }),
      baseTask({ id: 2, crane_id: 2, path: [{ x: 80, y: 0 }, { x: 80, y: 100 }] }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    const hit = find(conflicts, CONFLICT_TYPE.PATH_CROSS).find((c) => c.severity === SEVERITY.HIGH);
    expect(hit).toBeTruthy();
    const actions = hit.suggestions.map((s) => s.action?.type);
    expect(actions).toContain(ACTION_TYPE.SHIFT_TASK);
    expect(actions).toContain(ACTION_TYPE.RAISE_TASK);
  });

  it('路径近但吊钩高度错开 -> 中危（竖向避让）', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1, hook_height: 20, path: [{ x: 40, y: 40 }, { x: 120, y: 40 }] }),
      baseTask({ id: 2, crane_id: 2, hook_height: 30, path: [{ x: 80, y: 0 }, { x: 80, y: 100 }] }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    const hit = find(conflicts, CONFLICT_TYPE.PATH_CROSS).find((c) => c.severity === SEVERITY.MEDIUM);
    expect(hit).toBeTruthy();
    expect(hit.description).toContain('竖向');
  });

  it('路径间距大于安全包络 -> 不报', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1, path: [{ x: 40, y: 40 }, { x: 120, y: 40 }] }),
      baseTask({ id: 2, crane_id: 2, path: [{ x: 40, y: 100 }, { x: 120, y: 100 }] }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    expect(find(conflicts, CONFLICT_TYPE.PATH_CROSS)).toHaveLength(0);
  });

  it('应用错峰建议后高危交叉降为中危（时段错开）', () => {
    const tasks = [
      baseTask({ id: 1, crane_id: 1, path: [{ x: 40, y: 40 }, { x: 120, y: 40 }] }),
      baseTask({ id: 2, crane_id: 2, path: [{ x: 80, y: 0 }, { x: 80, y: 100 }] }),
    ];
    const before = analyze(cranes, tasks);
    const hit = before.conflicts.find((c) => c.type === CONFLICT_TYPE.PATH_CROSS && c.severity === SEVERITY.HIGH);
    const shift = hit.suggestions.find((s) => s.action?.type === ACTION_TYPE.SHIFT_TASK).action;
    const moved = tasks.map((t) => (t.id === shift.taskId ? { ...t, start_time: shift.start_time, end_time: shift.end_time } : t));
    const after = analyze(cranes, moved);
    const still = after.conflicts.find((c) => c.type === CONFLICT_TYPE.PATH_CROSS && c.severity === SEVERITY.HIGH);
    expect(still).toBeFalsy();
  });
});

describe('路径侵入臂幅区（path-jib）', () => {
  it('路径穿越对方全回转扇区且对方有重叠作业 -> 高危', () => {
    const cranes = [
      baseCrane({ id: 1, x: 0, y: 0 }),
      baseCrane({ id: 2, x: 60, y: 0 }),
    ];
    // 1# 的吊钩路径从 2# 塔身附近穿过（进入 2# 半径 50 的扇区）
    const tasks = [
      baseTask({ id: 1, crane_id: 1, path: [{ x: 0, y: 0 }, { x: 90, y: 0 }] }),
      baseTask({ id: 2, crane_id: 2, path: [{ x: 60, y: 0 }, { x: 60, y: 30 }] }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    expect(find(conflicts, CONFLICT_TYPE.PATH_JIB).some((c) => c.severity === SEVERITY.HIGH)).toBe(true);
  });

  it('路径穿越扇区但对方无作业 -> 低危提示', () => {
    const cranes = [
      baseCrane({ id: 1, x: 0, y: 0 }),
      baseCrane({ id: 2, x: 60, y: 0 }),
    ];
    const tasks = [
      baseTask({ id: 1, crane_id: 1, path: [{ x: 0, y: 0 }, { x: 90, y: 0 }] }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    const hit = find(conflicts, CONFLICT_TYPE.PATH_JIB);
    expect(hit.some((c) => c.severity === SEVERITY.LOW)).toBe(true);
  });
});

describe('同机调度冲突（schedule）', () => {
  it('同一塔吊两个任务时间重叠 -> 低危并建议顺延', () => {
    const cranes = [baseCrane()];
    const tasks = [
      baseTask({ id: 1, start_time: minutesFromNow(0), end_time: minutesFromNow(60) }),
      baseTask({ id: 2, name: '任务2', start_time: minutesFromNow(30), end_time: minutesFromNow(90) }),
    ];
    const { conflicts, summary } = analyze(cranes, tasks);
    const hit = find(conflicts, CONFLICT_TYPE.SCHEDULE);
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe(SEVERITY.LOW);
    expect(hit[0].suggestions[0].action.type).toBe(ACTION_TYPE.SHIFT_TASK);
    // 顺延后新开始时间 >= 原结束时间
    const shift = hit[0].suggestions[0].action;
    expect(new Date(shift.start_time).getTime()).toBeGreaterThanOrEqual(new Date(tasks[0].end_time).getTime());
    expect(summary.low).toBeGreaterThanOrEqual(1);
  });

  it('首尾相接（端点重合）不算冲突', () => {
    const cranes = [baseCrane()];
    const tasks = [
      baseTask({ id: 1, start_time: minutesFromNow(0), end_time: minutesFromNow(60) }),
      baseTask({ id: 2, start_time: minutesFromNow(60), end_time: minutesFromNow(120) }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    expect(find(conflicts, CONFLICT_TYPE.SCHEDULE)).toHaveLength(0);
  });
});

describe('汇总输出', () => {
  it('空配置返回零冲突与计数', () => {
    const result = analyze([], []);
    expect(result.conflicts).toEqual([]);
    expect(result.summary).toMatchObject({ total: 0, high: 0, medium: 0, low: 0, craneCount: 0, taskCount: 0 });
  });

  it('冲突按高 -> 中 -> 低排序', () => {
    const cranes = [baseCrane()];
    const tasks = [
      baseTask({ id: 1, start_time: minutesFromNow(0), end_time: minutesFromNow(60) }),
      baseTask({ id: 2, start_time: minutesFromNow(30), end_time: minutesFromNow(90) }),
    ];
    const { conflicts } = analyze(cranes, tasks);
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < conflicts.length; i++) {
      expect(order[conflicts[i].severity]).toBeGreaterThanOrEqual(order[conflicts[i - 1].severity]);
    }
  });
});
