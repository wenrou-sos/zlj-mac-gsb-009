// 平面几何引擎
// 坐标约定：x 向东，y 向南（与画布一致）；角度为度，0° 指向东，顺时针为正。
// 扇区 Sector = { cx, cy, r, start, sweep }，表示以 (cx,cy) 为圆心、半径 r、
// 从 start 起顺时针扫过 sweep 度（sweep <= 360）的回转范围。

export const DEG = Math.PI / 180;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// 角度归一化到 [0, 360)
export function normDeg(a) {
  return ((a % 360) + 360) % 360;
}

// 将度数差 b - a 归一化到 (-180, 180]
export function angleDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

// 角度 a 是否落在以 start 起、顺时针 sweep 的弧内
export function angleOnArc(start, sweep, a) {
  return normDeg(a - start) <= sweep + 1e-9;
}

// 点是否在扇区内（含边界）
export function pointInSector(x, y, s) {
  const d = dist(x, y, s.cx, s.cy);
  if (d > s.r + 1e-9 || d < -1e-9) return false;
  if (d <= 1e-9) return true;
  const a = normDeg(Math.atan2(y - s.cy, x - s.cx) / DEG);
  return angleOnArc(s.start, s.sweep, a);
}

// 两线段是否相交（含端点接触）
export function segmentsIntersect(p1, p2, q1, q2) {
  const d = (p2.x - p1.x) * (q2.y - q1.y) - (p2.y - p1.y) * (q2.x - q1.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((q1.x - p1.x) * (q2.y - q1.y) - (q1.y - p1.y) * (q2.x - q1.x)) / d;
  const u = ((q1.x - p1.x) * (p2.y - p1.y) - (q1.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
}

export function pointSegDist(x, y, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(x, y, a.x, a.y);
  const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1);
  return Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
}

export function segSegDist(p1, p2, q1, q2) {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0;
  return Math.min(
    pointSegDist(p1.x, p1.y, q1, q2),
    pointSegDist(p2.x, p2.y, q1, q2),
    pointSegDist(q1.x, q1.y, p1, p2),
    pointSegDist(q2.x, q2.y, p1, p2),
  );
}

// 线段与圆的交点（1~2 个）
function segCirclePoints(p1, p2, c) {
  const dxp = p2.x - p1.x;
  const dyp = p2.y - p1.y;
  const fx = p1.x - c.cx;
  const fy = p1.y - c.cy;
  const A = dxp * dxp + dyp * dyp;
  const B = 2 * (fx * dxp + fy * dyp);
  const C = fx * fx + fy * fy - c.r * c.r;
  let disc = B * B - 4 * A * C;
  if (disc < -1e-9 || A === 0) return [];
  disc = Math.max(0, disc);
  const sq = Math.sqrt(disc);
  const out = [];
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t >= -1e-9 && t <= 1 + 1e-9) {
      out.push({ x: p1.x + t * dxp, y: p1.y + t * dyp });
    }
  }
  return out;
}

// 扇区两条径向边
function radialEdges(s) {
  const end = s.start + s.sweep;
  return [
    { a: { x: s.cx, y: s.cy }, b: { x: s.cx + s.r * Math.cos(s.start * DEG), y: s.cy + s.r * Math.sin(s.start * DEG) } },
    { a: { x: s.cx, y: s.cy }, b: { x: s.cx + s.r * Math.cos(end * DEG), y: s.cy + s.r * Math.sin(end * DEG) } },
  ];
}

// 两圆交点（最多 2 个）
function circleCirclePoints(sA, sB) {
  const dx = sB.cx - sA.cx;
  const dy = sB.cy - sA.cy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return [];
  if (d > sA.r + sB.r + 1e-9 || d < Math.abs(sA.r - sB.r) - 1e-9) return [];
  const a = (sA.r * sA.r - sB.r * sB.r + d * d) / (2 * d);
  const h2 = sA.r * sA.r - a * a;
  if (h2 < -1e-9) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const mx = sA.cx + (a * dx) / d;
  const my = sA.cy + (a * dy) / d;
  const px = (-dy * h) / d;
  const py = (dx * h) / d;
  if (h < 1e-9) return [{ x: mx, y: my }];
  return [
    { x: mx + px, y: my + py },
    { x: mx - px, y: my - py },
  ];
}

/**
 * 判断两个扇区是否相交（边界接触也算）。
 * 判据：① 任一圆心落在对方扇区内；
 *       ② 两外圆交点同时落在两扇区内；
 *       ③ 一扇区径向边与另一外圆的交点同时落在两扇区内。
 */
export function sectorsOverlap(sA, sB) {
  if (dist(sA.cx, sA.cy, sB.cx, sB.cy) <= sA.r + 1e-9 && pointInSector(sB.cx, sB.cy, sA)) return true;
  if (dist(sA.cx, sA.cy, sB.cx, sB.cy) <= sB.r + 1e-9 && pointInSector(sA.cx, sA.cy, sB)) return true;

  for (const p of circleCirclePoints(sA, sB)) {
    if (pointInSector(p.x, p.y, sA) && pointInSector(p.x, p.y, sB)) return true;
  }
  for (const e of radialEdges(sA)) {
    for (const p of segCirclePoints(e.a, e.b, sB)) {
      if (pointInSector(p.x, p.y, sA) && pointInSector(p.x, p.y, sB)) return true;
    }
  }
  for (const e of radialEdges(sB)) {
    for (const p of segCirclePoints(e.a, e.b, sA)) {
      if (pointInSector(p.x, p.y, sA) && pointInSector(p.x, p.y, sB)) return true;
    }
  }
  return false;
}

// 圆 A（大臂整圆扫掠区）与扇区 B 是否相交
export function circleOverlapsSector(cA, sB) {
  return sectorsOverlap({ ...cA, start: 0, sweep: 360 }, sB);
}

/**
 * 点到扇区的距离。
 * 点在扇区内返回 0；否则取到圆心（角度不匹配）、两条径向边、外圆弧的最小距离。
 */
export function pointSectorDist(x, y, s) {
  if (pointInSector(x, y, s)) return 0;
  const d = dist(x, y, s.cx, s.cy);
  const a = normDeg(Math.atan2(y - s.cy, x - s.cx) / DEG);
  const candidates = [];
  // 到圆心（半径方向不匹配时的最近点）
  if (d >= s.r) candidates.push(d - s.r);
  // 到径向边
  const [e1, e2] = radialEdges(s);
  candidates.push(pointSegDist(x, y, e1.a, e1.b), pointSegDist(x, y, e2.a, e2.b));
  // 到外圆弧
  if (angleOnArc(s.start, s.sweep, a)) candidates.push(Math.abs(d - s.r));
  return Math.min(...candidates);
}

/**
 * 折线路径到扇区的最小距离：逐段比较到圆心/径向边/弧，并对每段按弧长细分采样。
 */
export function pathSectorDist(points, s) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const [e1, e2] = radialEdges(s);
    min = Math.min(
      min,
      segSegDist(a, b, e1.a, e1.b),
      segSegDist(a, b, e2.a, e2.b),
      pointSectorDist(a.x, a.y, s),
      pointSectorDist(b.x, b.y, s),
    );
    // 与外圆弧的相交用细采样兜底（圆弧解析求交较复杂，24 段对百米级路径足够精确）
    const segLen = dist(a.x, a.y, b.x, b.y);
    const steps = Math.max(2, Math.ceil(segLen / 4));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const d = dist(px, py, s.cx, s.cy);
      const ang = normDeg(Math.atan2(py - s.cy, px - s.cx) / DEG);
      if (angleOnArc(s.start, s.sweep, ang)) min = Math.min(min, Math.abs(d - s.r));
      if (d <= s.r && !angleOnArc(s.start, s.sweep, ang)) min = Math.min(min, s.r - d);
    }
  }
  return min;
}

// 两条折线路径之间的最小净距
export function pathDistance(p1, p2) {
  let min = Infinity;
  for (let i = 0; i < p1.length - 1; i++) {
    for (let j = 0; j < p2.length - 1; j++) {
      min = Math.min(min, segSegDist(p1[i], p1[i + 1], p2[j], p2[j + 1]));
    }
  }
  return min;
}

// 找到两条路径净距最小的见证点（用于前端标注冲突位置），取中点近似
export function pathWitness(p1, p2) {
  let best = { dist: Infinity, point: null };
  for (let i = 0; i < p1.length - 1; i++) {
    for (let j = 0; j < p2.length - 1; j++) {
      const samples = 8;
      for (let u = 0; u <= samples; u++) {
        for (let v = 0; v <= samples; v++) {
          const a = { x: p1[i].x + (p1[i + 1].x - p1[i].x) * (u / samples), y: p1[i].y + (p1[i + 1].y - p1[i].y) * (u / samples) };
          const b = { x: p2[j].x + (p2[j + 1].x - p2[j].x) * (v / samples), y: p2[j].y + (p2[j + 1].y - p2[j].y) * (v / samples) };
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < best.dist) best = { dist: d, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        }
      }
    }
  }
  return best.point;
}

// 点到塔身圆（圆心 + 半径）的净距
export function pointCircleDist(x, y, c) {
  return Math.max(0, dist(x, y, c.cx, c.cy) - c.r);
}

// 路径到塔身圆的最小净距
export function pathCircleDist(points, c) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    min = Math.min(
      pointCircleDist(a.x, a.y, c),
      pointCircleDist(b.x, b.y, c),
      // 圆心到线段投影
      Math.max(0, pointSegDist(c.cx, c.cy, a, b) - c.r),
    );
  }
  return min;
}
