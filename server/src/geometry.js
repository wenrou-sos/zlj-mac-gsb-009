// 几何与时间工具：塔吊回转扇区、路径插值、时段运算
// 坐标单位：米；角度单位：度（0 = 正北，顺时针）；时间单位：分钟（0~1439）

export const SITE = { width: 120, height: 90 };
export const JIB_HEIGHT_CLEARANCE = 3; // 起重臂竖向净空（米），小于该值视为空间冲突
export const LOAD_HEIGHT_CLEARANCE = 2; // 吊重之间的竖向净空（米）
export const LOAD_SAFETY_GAP = 3; // 吊重平面安全间距（米）
export const TOWER_RADIUS = 2; // 塔身等效半径（米）

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** "HH:MM" -> 分钟数 */
export function toMinute(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 分钟数 -> "HH:MM" */
export function toHHMM(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** 角度归一化到 [0, 360) */
export function normAngle(a) {
  return ((a % 360) + 360) % 360;
}

/** 塔吊方位角（正北顺时针）-> 数学角（x 轴正方向逆时针） */
export function bearingToMath(deg) {
  return normAngle(90 - deg);
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** 两个半开区间是否重叠，返回重叠分钟数 */
export function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** 点 (px,py) 是否在以 (cx,cy) 为圆心、minR~maxR 半径、bearing±sweep/2 的回转扇区内 */
export function sectorContains(crane, px, py) {
  const d = dist(crane.x, crane.y, px, py);
  if (d < crane.minRadius - 1e-9 || d > crane.maxRadius + 1e-9) return false;
  if (crane.sweep >= 360) return true;
  const bearing = normAngle(90 - (Math.atan2(py - crane.y, px - crane.x) * 180) / Math.PI);
  let diff = Math.abs(normAngle(bearing) - normAngle(crane.bearing));
  diff = Math.min(diff, 360 - diff);
  return diff <= crane.sweep / 2 + 1e-9;
}

/** 两圆（圆心距 d，半径 r1/r2）的交点；0、1 或 2 个 */
function circleIntersections(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d < 1e-12) {
    // 同心圆或相离/内含：用半径方向上的最近点补充候选
    if (d < 1e-12) return [];
    const ux = dx / d;
    const uy = dy / d;
    return [{ x: x1 + ux * r1, y: y1 + uy * r1 }];
  }
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = x1 + (a * dx) / d;
  const my = y1 + (a * dy) / d;
  const px = (-dy / d) * h;
  const py = (dx / d) * h;
  if (h < 1e-9) return [{ x: mx, y: my }];
  return [
    { x: mx + px, y: my + py },
    { x: mx - px, y: my - py },
  ];
}

function bearingPoint(c, radius, bearing) {
  const rad = toRad(bearing);
  return { x: c.x + radius * Math.sin(rad), y: c.y - radius * Math.cos(rad) };
}

/** 两个回转扇区（圆环段）在平面上是否相交 */
export function sectorsOverlap(a, b) {
  // 快速排除：最大幅度圆不相交
  if (dist(a.x, a.y, b.x, b.y) > a.maxRadius + b.maxRadius + 1e-9) return false;

  const candidates = [];
  const push = (p) => {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) candidates.push(p);
  };

  // 1) 各自圆心
  push({ x: a.x, y: a.y });
  push({ x: b.x, y: b.y });

  // 2) 沿各自弧段采样（内/外弧），处理一个扇区横跨另一个的情况
  for (const c of [a, b]) {
    const samples = c.sweep >= 360 ? 16 : Math.max(3, Math.ceil(c.sweep / 15));
    for (const r of [c.minRadius, c.maxRadius]) {
      for (let k = 0; k <= samples; k++) {
        const ang = normAngle(c.bearing - c.sweep / 2 + (c.sweep * k) / samples);
        push(bearingPoint(c, r, ang));
      }
    }
  }

  // 3) 半径圆两两交点（外-外、外-内、内-外、内-内）
  for (const ra of [a.minRadius, a.maxRadius]) {
    for (const rb of [b.minRadius, b.maxRadius]) {
      for (const p of circleIntersections(a.x, a.y, ra, b.x, b.y, rb)) push(p);
    }
  }

  // 任意候选点同时落在两个扇区内即相交（含边界）
  return candidates.some((p) => {
    const inA = sectorContains(a, p.x, p.y);
    const inB = sectorContains(b, p.x, p.y);
    return inA && inB;
  });
}

/** 折线路径总长度 */
export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  return total;
}

/** 折线路径按弧长参数 t∈[0,1] 插值 */
export function pointAt(path, t) {
  if (path.length === 1) return { ...path[0] };
  const total = pathLength(path);
  if (total === 0) return { ...path[0] };
  let target = clamp(t, 0, 1) * total;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
    if (target <= seg || i === path.length - 1) {
      const k = seg === 0 ? 0 : target / seg;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * k,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * k,
      };
    }
    target -= seg;
  }
  return { ...path[path.length - 1] };
}

/** 任务在 minute 时刻的吊重状态：平面位置 + 吊重高度（米） */
export function taskState(task, minute) {
  const s = toMinute(task.start);
  const e = toMinute(task.end);
  const t = clamp((minute - s) / (e - s), 0, 1);
  const pos = pointAt(task.path, t);
  // 先起升到安全高度、平移、再落钩：起钩/落钩各占时长 15%
  let height;
  if (t < 0.15) height = task.liftHeight * (t / 0.15);
  else if (t > 0.85) height = task.liftHeight * (1 - (t - 0.85) / 0.15);
  else height = task.liftHeight;
  return { x: pos.x, y: pos.y, height: clamp(height, 0, task.liftHeight), t };
}

/** 起重臂当前方位角（线性往返回转） */
export function jibBearing(task, minute) {
  const s = toMinute(task.start);
  const e = toMinute(task.end);
  const t = clamp((minute - s) / (e - s), 0, 1);
  const a0 = task.jibStart;
  const a1 = task.jibEnd;
  let diff = normAngle(a1 - a0);
  const delta = diff <= 180 ? (diff - 360 < -diff ? diff : diff - 360) : diff - 360;
  return normAngle(a0 + delta * t);
}

/** 起重臂端部坐标 */
export function jibTip(crane, bearing) {
  const rad = toRad(bearingToMath(bearing));
  return { x: crane.x + crane.maxRadius * Math.cos(rad), y: crane.y + crane.maxRadius * Math.sin(rad) };
}
