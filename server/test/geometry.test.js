import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sectorContains,
  sectorsOverlap,
  pointAt,
  pathLength,
  overlap,
  toMinute,
  toHHMM,
  taskState,
  jibBearing,
  normAngle,
} from '../src/geometry.js';

const crane = (over = {}) => ({
  id: 1, name: 'T', x: 0, y: 0, maxRadius: 40, minRadius: 4, bearing: 0, sweep: 90, jibHeight: 30, ...over,
});

describe('时间工具', () => {
  test('HH:MM 与分钟互转', () => {
    assert.equal(toMinute('09:30'), 570);
    assert.equal(toHHMM(570), '09:30');
    assert.equal(toHHMM(1440), '00:00');
  });

  test('时段重叠分钟数', () => {
    assert.equal(overlap(0, 100, 50, 150), 50);
    assert.equal(overlap(0, 50, 60, 100), 0);
  });
});

describe('回转扇区几何', () => {
  test('扇区包含判定（0° 正北、±45°）', () => {
    const c = crane();
    assert.ok(sectorContains(c, 0, 20)); // 正北
    assert.ok(sectorContains(c, 20, 20)); // 45° 边界
    assert.ok(!sectorContains(c, -25, 10)); // 约 292°，不在 315~45 内
    assert.ok(!sectorContains(c, 0, 2)); // 内孔盲区
    assert.ok(!sectorContains(c, 0, 50)); // 超出幅度
  });

  test('全回转就是圆环', () => {
    const c = crane({ bearing: 0, sweep: 360 });
    assert.ok(sectorContains(c, 10, -10));
    assert.ok(!sectorContains(c, 0, 3));
  });

  test('两个圆环扇区相交/相离', () => {
    const a = crane({ x: 0, y: 0, maxRadius: 40, sweep: 360 });
    const b = crane({ id: 2, x: 60, y: 0, maxRadius: 40, sweep: 360 });
    assert.ok(sectorsOverlap(a, b), '间距 60 < 半径和 80，应重叠');

    const far = crane({ id: 3, x: 200, y: 0, maxRadius: 20, sweep: 360 });
    assert.ok(!sectorsOverlap(a, far), '相距过远不应重叠');
  });

  test('朝向相反的受限扇区不重叠，放宽扫幅后重叠', () => {
    const a = crane({ x: 0, y: 0, bearing: 0, sweep: 30, maxRadius: 40 });
    const b = crane({ id: 2, x: 30, y: 0, bearing: 180, sweep: 30, maxRadius: 40 });
    assert.ok(!sectorsOverlap(a, b));
    assert.ok(sectorsOverlap(a, { ...b, sweep: 300 }));
  });
});

describe('路径插值与任务状态', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  test('折线路径长度与插值', () => {
    assert.equal(pathLength(path), 20);
    const approx = (p, x, y) => assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
    approx(pointAt(path, 0), 0, 0);
    approx(pointAt(path, 0.5), 10, 0);
    approx(pointAt(path, 1), 10, 10);
  });

  const task = {
    name: 'X', start: '09:00', end: '10:00', liftHeight: 20,
    jibStart: 0, jibEnd: 90, path,
  };

  test('起钩/平移/落钩高度曲线', () => {
    assert.equal(taskState(task, 9 * 60).height, 0);
    assert.equal(taskState(task, 9 * 60 + 30).height, 20); // t=0.5 平移段满高
    assert.equal(taskState(task, 10 * 60).height, 0);
  });

  test('起重臂角度线性回转（含跨 0° 处理）', () => {
    assert.equal(Math.round(jibBearing(task, 9 * 60)), 0);
    assert.equal(Math.round(jibBearing(task, 10 * 60)), 90);
    assert.equal(Math.round(jibBearing({ ...task, jibStart: 10, jibEnd: 350 }, 9 * 60 + 30)), 0);
    assert.equal(normAngle(-30), 330);
  });
});
