import { describe, it, expect } from 'vitest';
import {
  angleDelta,
  angleOnArc,
  normDeg,
  pathDistance,
  pathSectorDist,
  pointInSector,
  pointSegDist,
  sectorsOverlap,
  segSegDist,
} from '../shared/geometry.js';

describe('角度工具', () => {
  it('normDeg 归一化到 [0,360)', () => {
    expect(normDeg(0)).toBe(0);
    expect(normDeg(360)).toBe(0);
    expect(normDeg(-90)).toBe(270);
    expect(normDeg(720)).toBe(0);
  });

  it('angleDelta 取最小夹角', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
  });

  it('angleOnArc 判定角度是否在扫掠弧内', () => {
    expect(angleOnArc(0, 90, 45)).toBe(true);
    expect(angleOnArc(0, 90, 100)).toBe(false);
    expect(angleOnArc(350, 20, 0)).toBe(true); // 跨越 0°
    expect(angleOnArc(350, 20, 180)).toBe(false);
  });
});

describe('点 / 线段', () => {
  it('点到线段距离（含投影落在线段外）', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(pointSegDist(5, 3, a, b)).toBeCloseTo(3, 6);
    expect(pointSegDist(-4, 0, a, b)).toBeCloseTo(4, 6);
    expect(pointSegDist(12, -5, a, b)).toBeCloseTo(Math.hypot(2, 5), 6); // 最近点为端点 (10,0)
  });

  it('segSegDist 相交返回 0，平行线段返回垂直间距', () => {
    expect(
      segSegDist({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(0);
    expect(
      segSegDist({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBeCloseTo(5, 6);
  });
});

describe('扇区几何', () => {
  const full = { cx: 0, cy: 0, r: 50, start: 0, sweep: 360 };
  const quadrant = { cx: 0, cy: 0, r: 50, start: 0, sweep: 90 };

  it('点在整圆 / 扇区内的判定', () => {
    expect(pointInSector(30, 30, full)).toBe(true);
    expect(pointInSector(60, 0, full)).toBe(false);
    expect(pointInSector(30, 30, quadrant)).toBe(true);
    expect(pointInSector(-30, 30, quadrant)).toBe(false);
    expect(pointInSector(30, -30, quadrant)).toBe(false);
    // 圆心属于任何扇区
    expect(pointInSector(0, 0, quadrant)).toBe(true);
  });

  it('全圆相交 / 相离', () => {
    expect(sectorsOverlap(full, { cx: 80, cy: 0, r: 50, start: 0, sweep: 360 })).toBe(true);
    expect(sectorsOverlap(full, { cx: 120, cy: 0, r: 50, start: 0, sweep: 360 })).toBe(false);
  });

  it('扇区按朝向相交：对向时不相交，转向后相交', () => {
    const left = { cx: 0, cy: 0, r: 60, start: 180, sweep: 90 };
    const rightFar = { cx: 50, cy: 0, r: 60, start: 0, sweep: 90 };
    expect(sectorsOverlap(left, rightFar)).toBe(false);
    const leftTurned = { cx: 0, cy: 0, r: 60, start: 0, sweep: 90 };
    expect(sectorsOverlap(leftTurned, rightFar)).toBe(true);
  });

  it('一个整圆与受限扇区：仅圆心方向落入扇区时才相交', () => {
    const s = { cx: 0, cy: 0, r: 60, start: 0, sweep: 45 };
    // 另一圆心位于 90° 方向，超出 0~45° 扇区
    expect(sectorsOverlap(s, { cx: 0, cy: 30, r: 20, start: 0, sweep: 360 })).toBe(false);
    // 位于 20° 方向
    const x = 30 * Math.cos((20 * Math.PI) / 180);
    const y = 30 * Math.sin((20 * Math.PI) / 180);
    expect(sectorsOverlap(s, { cx: x, cy: y, r: 20, start: 0, sweep: 360 })).toBe(true);
  });

  it('路径与扇区距离', () => {
    const s = { cx: 0, cy: 0, r: 50, start: 0, sweep: 90 };
    // 路径在第一象限内穿过 -> 距离 0
    expect(
      pathSectorDist(
        [
          { x: 10, y: 10 },
          { x: 40, y: 40 },
        ],
        s,
      ),
    ).toBe(0);
    // 路径在第三象限（角度相反）-> 正距离
    const d = pathSectorDist(
      [
        { x: -100, y: -100 },
        { x: -60, y: -60 },
      ],
      s,
    );
    expect(d).toBeGreaterThan(10);
  });

  it('两条折线路径净距', () => {
    const p1 = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const p2 = [
      { x: 0, y: 12 },
      { x: 100, y: 12 },
    ];
    expect(pathDistance(p1, p2)).toBeCloseTo(12, 6);
    const cross = [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ];
    expect(pathDistance(p1, cross)).toBe(0);
  });
});
