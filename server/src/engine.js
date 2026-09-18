// 冲突检测引擎：空间碰撞（起重臂/吊重/塔身）+ 时间冲突（同机时段重叠）
import {
  JIB_HEIGHT_CLEARANCE,
  LOAD_HEIGHT_CLEARANCE,
  LOAD_SAFETY_GAP,
  TOWER_RADIUS,
  sectorsOverlap,
  dist,
  overlap,
  toMinute,
  toHHMM,
  clamp,
  taskState,
  jibBearing,
  jibTip,
  normAngle,
} from './geometry.js';

const DAY = 1440;

/** 点 P 到线段 AB 的最短距离 */
function pointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** 吊重是否贴近某台塔吊当前的起重臂线段（含最小幅度盲区） */
function nearJib(crane, bearing, x, y) {
  const tip = jibTip(crane, bearing);
  const rad = (Math.atan2(tip.y - crane.y, tip.x - crane.x));
  const inner = {
    x: crane.x + crane.minRadius * Math.cos(rad),
    y: crane.y + crane.minRadius * Math.sin(rad),
  };
  return pointSegment(x, y, inner.x, inner.y, tip.x, tip.y) <= LOAD_SAFETY_GAP;
}

function jibAngleTowards(crane, x, y) {
  return normAngle(90 - (Math.atan2(y - crane.y, x - crane.x) * 180) / Math.PI);
}

/** 在两任务共同时段内逐分钟采样，返回首次碰撞样本 */
function samplePair(craneA, taskA, craneB, taskB) {
  const aS = toMinute(taskA.start);
  const aE = toMinute(taskA.end);
  const bS = toMinute(taskB.start);
  const bE = toMinute(taskB.end);
  const from = Math.max(aS, bS);
  const to = Math.min(aE, bE);
  for (let m = from; m <= to; m++) {
    const sa = taskState(taskA, m);
    const sb = taskState(taskB, m);

    // 1) 吊重与吊重
    if (
      dist(sa.x, sa.y, sb.x, sb.y) <= LOAD_SAFETY_GAP &&
      Math.abs(sa.height - sb.height) < LOAD_HEIGHT_CLEARANCE
    ) {
      return { kind: 'load_load', minute: m, stateA: sa, stateB: sb };
    }

    const bearingB = jibBearing(taskB, m);
    const bearingA = jibBearing(taskA, m);

    // 2) A 的吊重进入 B 的起重臂
    if (
      nearJib(craneB, bearingB, sa.x, sa.y) &&
      Math.abs(sa.height - craneB.jibHeight) < JIB_HEIGHT_CLEARANCE
    ) {
      return { kind: 'load_jib', minute: m, loadTask: taskA, loadState: sa, jibCrane: craneB, jibBearing: bearingB };
    }
    // 3) B 的吊重进入 A 的起重臂
    if (
      nearJib(craneA, bearingA, sb.x, sb.y) &&
      Math.abs(sb.height - craneA.jibHeight) < JIB_HEIGHT_CLEARANCE
    ) {
      return { kind: 'load_jib', minute: m, loadTask: taskB, loadState: sb, jibCrane: craneA, jibBearing: bearingA };
    }
  }
  return null;
}

/** 吊重路径是否穿越另一台塔吊塔身 */
function sampleTower(crane, ownCraneId, task) {
  if (crane.id === ownCraneId) return null;
  const s = toMinute(task.start);
  const e = toMinute(task.end);
  for (let m = s; m <= e; m++) {
    const st = taskState(task, m);
    if (dist(st.x, st.y, crane.x, crane.y) <= TOWER_RADIUS && st.height < crane.jibHeight) {
      return { kind: 'load_tower', minute: m, state: st, towerCrane: crane };
    }
  }
  return null;
}

/** 为某任务寻找当天可行的顺延起始分钟（不早于原计划，避开全部同机时段与跨机碰撞） */
export function findFeasibleStart(task, cranes, tasks) {
  const duration = toMinute(task.end) - toMinute(task.start);
  const craneById = new Map(cranes.map((c) => [c.id, c]));
  for (let start = toMinute(task.start); start + duration <= DAY; start++) {
    const shifted = { ...task, start: toHHMM(start), end: toHHMM(start + duration) };
    let ok = true;
    for (const other of tasks) {
      if (other.id === task.id) continue;
      if (!overlap(start, start + duration, toMinute(other.start), toMinute(other.end))) continue;
      if (other.craneId === task.craneId) {
        ok = false;
        break;
      }
      const a = craneById.get(shifted.craneId);
      const b = craneById.get(other.craneId);
      if (!a || !b) continue;
      // 粗采样验证空间碰撞
      const hit = coarsePair(a, shifted, b, other);
      if (hit) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return null;
}

function coarsePair(craneA, taskA, craneB, taskB) {
  const from = Math.max(toMinute(taskA.start), toMinute(taskB.start));
  const to = Math.min(toMinute(taskA.end), toMinute(taskB.end));
  for (let m = from; m <= to; m += 2) {
    const sa = taskState(taskA, m);
    const sb = taskState(taskB, m);
    if (dist(sa.x, sa.y, sb.x, sb.y) <= LOAD_SAFETY_GAP) return true;
    if (nearJib(craneB, jibBearing(taskB, m), sa.x, sa.y) && Math.abs(sa.height - craneB.jibHeight) < JIB_HEIGHT_CLEARANCE) return true;
    if (nearJib(craneA, jibBearing(taskA, m), sb.x, sb.y) && Math.abs(sb.height - craneA.jibHeight) < JIB_HEIGHT_CLEARANCE) return true;
  }
  return false;
}

function delaySuggestion(task, cranes, tasks) {
  const feasible = findFeasibleStart(task, cranes, tasks);
  if (feasible === null) return null;
  const duration = toMinute(task.end) - toMinute(task.start);
  return {
    action: 'reschedule',
    newStart: toHHMM(feasible),
    newEnd: toHHMM(feasible + duration),
    description: `将「${task.name}」顺延至 ${toHHMM(feasible)} 开始（${toHHMM(feasible + duration)} 结束），可避开当天全部冲突。`,
  };
}

/** 主分析入口：返回全部冲突及调整建议 */
export function analyzeSchedule(cranes, tasks) {
  const conflicts = [];
  const craneById = new Map(cranes.map((c) => [c.id, c]));
  let seq = 0;
  const id = () => `C${++seq}`;

  // 1) 静态：两台塔吊回转扇区在高度上无法避让
  for (let i = 0; i < cranes.length; i++) {
    for (let j = i + 1; j < cranes.length; j++) {
      const a = cranes[i];
      const b = cranes[j];
      if (!sectorsOverlap(a, b)) continue;
      const gap = Math.abs(a.jibHeight - b.jibHeight);
      if (gap >= JIB_HEIGHT_CLEARANCE) continue;
      const lower = a.jibHeight <= b.jibHeight ? a : b;
      const raiseTo = Math.max(a.jibHeight, b.jibHeight) + JIB_HEIGHT_CLEARANCE;
      const angAToB = Math.round(jibAngleTowards(a, b.x, b.y));
      const angBToA = Math.round(jibAngleTowards(b, a.x, a.y));
      conflicts.push({
        id: id(),
        type: 'jib_overlap',
        severity: 'high',
        craneIds: [a.id, b.id],
        taskIds: [],
        message: `塔吊「${a.name}」与「${b.name}」回转范围重叠，臂尖高差仅 ${gap.toFixed(1)}m（< ${JIB_HEIGHT_CLEARANCE}m 净空），存在起重臂相撞风险。`,
        at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        suggestions: [
          {
            action: 'raise_jib',
            craneId: lower.id,
            jibHeight: raiseTo,
            description: `将「${lower.name}」起重臂标高提高至 ${raiseTo}m 以上，保证 ${JIB_HEIGHT_CLEARANCE}m 竖向净空。`,
          },
          {
            action: 'limit_slew',
            description: `在群塔防碰撞系统中限制回转：「${a.name}」避开方位角 ${angAToB}°、「${b.name}」避开方位角 ${angBToA}° 方向（或调小各自 sweep 扫幅使扇区不重叠）。`,
          },
        ],
      });
    }
  }

  // 2) 同机时间冲突
  for (const crane of cranes) {
    const mine = tasks
      .filter((t) => t.craneId === crane.id)
      .map((t) => ({ t, s: toMinute(t.start), e: toMinute(t.end) }))
      .filter((x) => x.e > x.s)
      .sort((x, y) => x.s - y.s);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        const x = mine[i];
        const y = mine[j];
        const mins = overlap(x.s, x.e, y.s, y.e);
        if (mins <= 0) continue;
        conflicts.push({
          id: id(),
          type: 'schedule_overlap',
          severity: 'high',
          craneIds: [crane.id],
          taskIds: [x.t.id, y.t.id],
          message: `塔吊「${crane.name}」任务「${x.t.name}」(${x.t.start}-${x.t.end}) 与「${y.t.name}」(${y.t.start}-${y.t.end}) 时段重叠 ${mins} 分钟，同一塔吊不可并行作业。`,
          at: { x: crane.x, y: crane.y },
          suggestions: [
            delaySuggestion(y.t, cranes, tasks),
            {
              action: 'manual',
              description: `或将其中一项任务改派给其他塔吊，并错开至少 ${mins} 分钟。`,
            },
          ].filter(Boolean),
        });
      }
    }
  }

  // 3) 跨机动态冲突：吊重-吊重 / 吊重-起重臂
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const ta = tasks[i];
      const tb = tasks[j];
      if (ta.craneId === tb.craneId) continue;
      const ca = craneById.get(ta.craneId);
      const cb = craneById.get(tb.craneId);
      if (!ca || !cb) continue;
      if (overlap(toMinute(ta.start), toMinute(ta.end), toMinute(tb.start), toMinute(tb.end)) <= 0) continue;
      const hit = samplePair(ca, ta, cb, tb);
      if (!hit) continue;

      if (hit.kind === 'load_load') {
        const taller = hit.stateA.height >= hit.stateB.height ? ta : tb;
        const lower = taller === ta ? tb : ta;
        conflicts.push({
          id: id(),
          type: 'load_load',
          severity: 'high',
          craneIds: [ca.id, cb.id],
          taskIds: [ta.id, tb.id],
          firstAt: toHHMM(hit.minute),
          at: { x: (hit.stateA.x + hit.stateB.x) / 2, y: (hit.stateA.y + hit.stateB.y) / 2 },
          message: `${toHHMM(hit.minute)} 起，「${ta.name}」与「${tb.name}」吊重在空间交会（平面间距 ≤ ${LOAD_SAFETY_GAP}m，高差 ${Math.abs(hit.stateA.height - hit.stateB.height).toFixed(1)}m）。`,
          suggestions: [
            delaySuggestion(tb, cranes, tasks),
            {
              action: 'raise_load',
              taskId: lower.id,
              liftHeight: Math.ceil(Math.max(ta.liftHeight, tb.liftHeight) + LOAD_HEIGHT_CLEARANCE),
              description: `将「${lower.name}」起升高度提高到 ${Math.ceil(Math.max(ta.liftHeight, tb.liftHeight) + LOAD_HEIGHT_CLEARANCE)}m 以上，实现错层吊装。`,
            },
            { action: 'reroute', description: `调整「${tb.name}」吊装路径，从「${ta.name}」路径侧面绕行并保持 ${LOAD_SAFETY_GAP}m 以上间距。` },
          ].filter(Boolean),
        });
      } else {
        const { loadTask, loadState, jibCrane, jibBearing: bearing } = hit;
        const otherTask = loadTask.id === ta.id ? tb : ta;
        const loadCrane = loadTask.craneId === ca.id ? ca : cb;
        const needHeight = Math.ceil(jibCrane.jibHeight + JIB_HEIGHT_CLEARANCE);
        conflicts.push({
          id: id(),
          type: 'load_jib',
          severity: 'high',
          craneIds: [loadCrane.id, jibCrane.id],
          taskIds: [loadTask.id, otherTask.id],
          firstAt: toHHMM(hit.minute),
          at: { x: loadState.x, y: loadState.y },
          message: `${toHHMM(hit.minute)} 起，「${loadTask.name}」的吊重（高 ${loadState.height.toFixed(1)}m）进入「${jibCrane.name}」起重臂（标高 ${jibCrane.jibHeight}m，方位 ${Math.round(bearing)}°）扫掠范围。`,
          suggestions: [
            delaySuggestion(loadTask, cranes, tasks),
            {
              action: 'raise_load',
              taskId: loadTask.id,
              liftHeight: needHeight,
              description: `将「${loadTask.name}」起升高度提高至 ${needHeight}m 以上，从「${jibCrane.name}」臂架上方越过。`,
            },
            {
              action: 'limit_slew',
              craneId: jibCrane.id,
              description: `限制「${jibCrane.name}」在 ${toHHMM(hit.minute)} 前后的回转角度，避开方位 ${Math.round(bearing)}° 方向。`,
            },
          ].filter(Boolean),
        });
      }
    }
  }

  // 4) 吊重穿越塔身
  for (const task of tasks) {
    const own = craneById.get(task.craneId);
    if (!own) continue;
    for (const crane of cranes) {
      const hit = sampleTower(crane, own.id, task);
      if (!hit) continue;
      conflicts.push({
        id: id(),
        type: 'load_tower',
        severity: 'medium',
        craneIds: [own.id, crane.id],
        taskIds: [task.id],
        firstAt: toHHMM(hit.minute),
        at: { x: crane.x, y: crane.y },
        message: `${toHHMM(hit.minute)}，「${task.name}」吊重路径穿越「${crane.name}」塔身（半径 ${TOWER_RADIUS}m 内且高度低于臂架）。`,
        suggestions: [
          {
            action: 'reroute',
            description: `修改「${task.name}」路径，从「${crane.name}」塔身外侧至少 ${TOWER_RADIUS + 2}m 处绕行。`,
          },
          {
            action: 'raise_load',
            taskId: task.id,
            liftHeight: crane.jibHeight + JIB_HEIGHT_CLEARANCE,
            description: `或将「${task.name}」起升高度提高到臂架标高以上后再通过。`,
          },
        ],
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  conflicts.sort((a, b) => order[a.severity] - order[b.severity] || (a.firstAt || '').localeCompare(b.firstAt || ''));
  return {
    conflicts,
    summary: {
      total: conflicts.length,
      high: conflicts.filter((c) => c.severity === 'high').length,
      medium: conflicts.filter((c) => c.severity === 'medium').length,
      low: conflicts.filter((c) => c.severity === 'low').length,
    },
  };
}

/** 某一时刻的实时预演：活动任务、吊重位置、实时危险点 */
export function liveHazards(cranes, tasks, minute) {
  const craneById = new Map(cranes.map((c) => [c.id, c]));
  const positions = [];
  const activeTasks = [];

  for (const task of tasks) {
    const s = toMinute(task.start);
    const e = toMinute(task.end);
    if (minute < s || minute >= e) continue;
    const crane = craneById.get(task.craneId);
    if (!crane) continue;
    const st = taskState(task, minute);
    const bearing = jibBearing(task, minute);
    activeTasks.push(task.id);
    positions.push({ taskId: task.id, craneId: crane.id, x: st.x, y: st.y, height: st.height, bearing });
  }

  const hazards = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const p = positions[i];
      const q = positions[j];
      const cp = craneById.get(p.craneId);
      const cq = craneById.get(q.craneId);
      if (dist(p.x, p.y, q.x, q.y) <= LOAD_SAFETY_GAP && Math.abs(p.height - q.height) < LOAD_HEIGHT_CLEARANCE) {
        hazards.push({ type: 'load_load', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, taskIds: [p.taskId, q.taskId] });
      }
      if (nearJib(cq, q.bearing, p.x, p.y) && Math.abs(p.height - cq.jibHeight) < JIB_HEIGHT_CLEARANCE) {
        hazards.push({ type: 'load_jib', x: p.x, y: p.y, taskIds: [p.taskId, q.taskId] });
      }
      if (nearJib(cp, p.bearing, q.x, q.y) && Math.abs(q.height - cp.jibHeight) < JIB_HEIGHT_CLEARANCE) {
        hazards.push({ type: 'load_jib', x: q.x, y: q.y, taskIds: [q.taskId, p.taskId] });
      }
    }
  }

  // 吊重穿越其他塔吊塔身
  for (const p of positions) {
    for (const crane of cranes) {
      if (crane.id === p.craneId) continue;
      if (dist(p.x, p.y, crane.x, crane.y) <= TOWER_RADIUS && p.height < crane.jibHeight) {
        hazards.push({ type: 'load_tower', x: p.x, y: p.y, taskIds: [p.taskId] });
      }
    }
  }

  return { minute, activeTaskIds: activeTasks, positions, hazards };
}
