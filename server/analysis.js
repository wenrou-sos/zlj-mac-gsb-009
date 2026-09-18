// 冲突分析引擎：输入塔吊与作业任务，输出空间碰撞 / 时间冲突及调整建议。
import {
  DEG,
  dist,
  pathCircleDist,
  pathDistance,
  pathSectorDist,
  pathWitness,
  pointInSector,
  sectorsOverlap,
} from '../shared/geometry.js';
import { tasksOverlap, toMillis, shiftTaskTo } from '../shared/time.js';
import {
  ACTION_TYPE,
  CONFLICT_TYPE,
  MAST_GAP,
  PATH_SAFE_GAP,
  SEVERITY,
  VERTICAL_CLEARANCE,
} from '../shared/constants.js';

const round1 = (n) => Math.round(n * 10) / 10;

// 塔吊当前大臂回转扇区
const swingSector = (c) => ({
  cx: c.x,
  cy: c.y,
  r: c.jib_length,
  start: c.swing_start,
  sweep: c.swing_sweep,
});

// 该任务进行期间，另一台塔吊是否有时间重叠的作业
const overlappingTasks = (task, others) => others.filter((t) => tasksOverlap(task, t));

function shiftSuggestion(conflictId, idx, later, earlierEndMs) {
  const moved = shiftTaskTo(later, Math.max(earlierEndMs, toMillis(later.start_time)));
  return {
    id: `${conflictId}-s${idx}`,
    text: `错峰：将「${later.name}」整体延后至 ${new Date(moved.start_time).toLocaleString('zh-CN', { hour12: false })} 开始`,
    action: { type: ACTION_TYPE.SHIFT_TASK, taskId: later.id, ...moved },
  };
}

function raiseSuggestion(conflictId, idx, task, safeHeight) {
  return {
    id: `${conflictId}-s${idx}`,
    text: `抬高：将「${task.name}」吊钩高度提升至 ${safeHeight} m 以上，形成竖向避让`,
    action: { type: ACTION_TYPE.RAISE_TASK, taskId: task.id, hook_height: safeHeight },
  };
}

/**
 * @param {Array} cranes 塔吊列表
 * @param {Array} tasks  作业任务列表（path 已解析为数组）
 */
export function analyze(cranes, tasks) {
  const conflicts = [];

  const craneById = new Map(cranes.map((c) => [c.id, c]));
  const tasksOf = (craneId) => tasks.filter((t) => t.crane_id === craneId);

  // ---------- 1. 塔吊两两做静态几何分析 ----------
  for (let i = 0; i < cranes.length; i++) {
    for (let j = i + 1; j < cranes.length; j++) {
      const A = cranes[i];
      const B = cranes[j];
      const d = dist(A.x, A.y, B.x, B.y);
      const sA = swingSector(A);
      const sB = swingSector(B);

      // 1a. 大臂扫过对方塔身
      // A 臂 -> B 塔身：B 塔心落在 A 回转扇区内，且 A 臂高度未越过 B 塔顶
      if (d - B.mast_radius <= A.jib_length && pointInSector(B.x, B.y, sA) && A.height - B.height < VERTICAL_CLEARANCE) {
        const safeR = Math.floor((d - B.mast_radius - MAST_GAP) * 10) / 10;
        conflicts.push({
          id: `mast-${A.id}-${B.id}`,
          type: CONFLICT_TYPE.MAST_HIT,
          severity: SEVERITY.HIGH,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: null,
          task_b_id: null,
          title: `${A.name} 大臂回转范围覆盖 ${B.name} 塔身`,
          description: `塔心间距 ${round1(d)} m，${A.name} 臂长 ${A.jib_length} m，回转时存在扫碰 ${B.name} 塔身的风险（臂顶高差 ${A.height - B.height} m < 安全净高 ${VERTICAL_CLEARANCE} m）。`,
          geometry: { kind: 'point', x: B.x, y: B.y },
          suggestions: [
            {
              id: `mast-${A.id}-${B.id}-s1`,
              text: `限幅：将 ${A.name} 允许作业半径限制在 ${safeR} m 以内，使臂端无法抵达 ${B.name} 塔身`,
              action: { type: ACTION_TYPE.LIMIT_SWING, craneId: A.id, jib_length: safeR },
            },
            {
              id: `mast-${A.id}-${B.id}-s2`,
              text: `调整 ${A.name} 回转起始角 / 扇区宽度，使回转扇区方位避开 ${B.name} 塔身（需在塔吊配置中手动修改）`,
              action: null,
            },
          ],
        });
      }
      // B 臂 -> A 塔身
      if (d - A.mast_radius <= B.jib_length && pointInSector(A.x, A.y, sB) && B.height - A.height < VERTICAL_CLEARANCE) {
        const safeR = Math.floor((d - A.mast_radius - MAST_GAP) * 10) / 10;
        conflicts.push({
          id: `mast-${B.id}-${A.id}`,
          type: CONFLICT_TYPE.MAST_HIT,
          severity: SEVERITY.HIGH,
          crane_a_id: B.id,
          crane_b_id: A.id,
          task_a_id: null,
          task_b_id: null,
          title: `${B.name} 大臂回转范围覆盖 ${A.name} 塔身`,
          description: `塔心间距 ${round1(d)} m，${B.name} 臂长 ${B.jib_length} m，回转时存在扫碰 ${A.name} 塔身的风险（臂顶高差 ${B.height - A.height} m < 安全净高 ${VERTICAL_CLEARANCE} m）。`,
          geometry: { kind: 'point', x: A.x, y: A.y },
          suggestions: [
            {
              id: `mast-${B.id}-${A.id}-s1`,
              text: `限幅：将 ${B.name} 允许作业半径限制在 ${safeR} m 以内，使臂端无法抵达 ${A.name} 塔身`,
              action: { type: ACTION_TYPE.LIMIT_SWING, craneId: B.id, jib_length: safeR },
            },
            {
              id: `mast-${B.id}-${A.id}-s2`,
              text: `调整 ${B.name} 回转起始角 / 扇区宽度，使回转扇区方位避开 ${A.name} 塔身（需在塔吊配置中手动修改）`,
              action: null,
            },
          ],
        });
      }

      // 1b. 双大臂空间重叠（仅当两机臂顶近似同高）
      const jibSameLevel = Math.abs(A.height - B.height) < VERTICAL_CLEARANCE;
      if (jibSameLevel && d < A.jib_length + B.jib_length && sectorsOverlap(sA, sB)) {
        const tA = tasksOf(A.id);
        const tB = tasksOf(B.id);
        let anyTimePair = false;

        for (const ta of tA) {
          for (const tb of tB) {
            if (!tasksOverlap(ta, tb)) continue;
            if (Math.abs(ta.hook_height - tb.hook_height) >= VERTICAL_CLEARANCE) continue;
            anyTimePair = true;
            const later = toMillis(ta.start_time) >= toMillis(tb.start_time) ? ta : tb;
            const earlier = later === ta ? tb : ta;
            const cid = `jib-${A.id}-${B.id}-${ta.id}-${tb.id}`;
            conflicts.push({
              id: cid,
              type: CONFLICT_TYPE.JIB_OVERLAP,
              severity: SEVERITY.HIGH,
              crane_a_id: A.id,
              crane_b_id: B.id,
              task_a_id: ta.id,
              task_b_id: tb.id,
              title: `${A.name} 与 ${B.name} 大臂重叠且作业时段重合`,
              description: `两台塔吊大臂回转扇区在空间上重叠，臂顶高差仅 ${Math.abs(A.height - B.height)} m；任务「${ta.name}」与「${tb.name}」时段重合，且吊钩高度差 ${Math.abs(ta.hook_height - tb.hook_height)} m < ${VERTICAL_CLEARANCE} m，存在臂架 / 吊载相撞风险。`,
              geometry: null,
              suggestions: [shiftSuggestion(cid, 1, later, toMillis(earlier.end_time))],
            });
          }
        }

        if (!anyTimePair) {
          conflicts.push({
            id: `jib-${A.id}-${B.id}-static`,
            type: CONFLICT_TYPE.JIB_OVERLAP,
            severity: SEVERITY.MEDIUM,
            crane_a_id: A.id,
            crane_b_id: B.id,
            task_a_id: null,
            task_b_id: null,
            title: `${A.name} 与 ${B.name} 大臂回转扇区空间重叠`,
            description: `两台塔吊臂顶同高（高差 ${Math.abs(A.height - B.height)} m）且回转扇区相交；当前作业计划时段已错开，但临时加派任务时极易触发碰撞，请保持错峰或为回转机构设置电子限位。`,
            geometry: null,
            suggestions: [
              {
                id: `jib-${A.id}-${B.id}-static-s1`,
                text: '保持现有作业错峰；如需同时作业，建议至少一方将吊钩高度错开 3 m 以上',
                action: null,
              },
            ],
          });
        }
      }
    }
  }

  // ---------- 2. 吊载路径 vs 另一台塔吊的吊载路径 / 臂幅区 / 塔身 ----------
  for (const ta of tasks) {
    const A = craneById.get(ta.crane_id);
    if (!A || !Array.isArray(ta.path) || ta.path.length < 2) continue;

    for (const tb of tasks) {
      if (tb.crane_id === ta.crane_id || tb.id >= ta.id) continue; // 每对只算一次
      const B = craneById.get(tb.crane_id);
      if (!B || !Array.isArray(tb.path) || tb.path.length < 2) continue;

      const minDist = pathDistance(ta.path, tb.path);
      if (minDist >= PATH_SAFE_GAP) continue;

      const cid = `path-${ta.id}-${tb.id}`;
      const witness = pathWitness(ta.path, tb.path);
      const timeHit = tasksOverlap(ta, tb);
      const verticalHit = Math.abs(ta.hook_height - tb.hook_height) < VERTICAL_CLEARANCE;

      if (timeHit && verticalHit) {
        const later = toMillis(ta.start_time) >= toMillis(tb.start_time) ? ta : tb;
        const earlier = later === ta ? tb : ta;
        const safeH = (later === ta ? tb : ta).hook_height + VERTICAL_CLEARANCE;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_CROSS,
          severity: SEVERITY.HIGH,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: tb.id,
          title: `吊载路径交叉：「${ta.name}」与「${tb.name}」`,
          description: `两条吊装路径最小净距约 ${round1(minDist)} m（< 安全包络 ${PATH_SAFE_GAP} m），作业时段重合且吊钩同高（高差 ${Math.abs(ta.hook_height - tb.hook_height)} m），吊载将在交叉点相撞。`,
          geometry: witness ? { kind: 'point', ...witness } : null,
          suggestions: [
            shiftSuggestion(cid, 1, later, toMillis(earlier.end_time)),
            raiseSuggestion(cid, 2, later, safeH),
          ],
        });
      } else if (timeHit) {
        // 时间重合但竖向已错开
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_CROSS,
          severity: SEVERITY.MEDIUM,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: tb.id,
          title: `路径空间交叉但竖向已错开：「${ta.name}」与「${tb.name}」`,
          description: `路径最小净距约 ${round1(minDist)} m，但吊钩高差 ${Math.abs(ta.hook_height - tb.hook_height)} m ≥ ${VERTICAL_CLEARANCE} m，保持当前吊高即可竖向立体避让，禁止中途变幅落钩。`,
          geometry: witness ? { kind: 'point', ...witness } : null,
          suggestions: [
            { id: `${cid}-s1`, text: '维持当前吊钩高差作业，严禁过程中调整吊钩高度', action: null },
          ],
        });
      } else {
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_CROSS,
          severity: SEVERITY.MEDIUM,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: tb.id,
          title: `吊装路径空间交叉（时段已错开）：「${ta.name}」与「${tb.name}」`,
          description: `路径最小净距约 ${round1(minDist)} m，但作业时段不重合；保持错峰即可，排程变更时需重新校验。`,
          geometry: witness ? { kind: 'point', ...witness } : null,
          suggestions: [{ id: `${cid}-s1`, text: '保持现有错峰计划', action: null }],
        });
      }
    }

    // 路径 vs 其他塔吊（臂幅区 + 塔身）
    for (const B of cranes) {
      if (B.id === A.id) continue;

      // 2a. 吊载路径逼近对方塔身（静态障碍物，抬钩可避让）
      const mastGap = pathCircleDist(ta.path, { cx: B.x, cy: B.y, r: B.mast_radius });
      if (mastGap < PATH_SAFE_GAP && ta.hook_height - B.height < VERTICAL_CLEARANCE) {
        const cid = `loadmast-${ta.id}-${B.id}`;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.MAST_HIT,
          severity: SEVERITY.HIGH,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: null,
          title: `「${ta.name}」吊载路径逼近 ${B.name} 塔身`,
          description: `路径距 ${B.name} 塔身外缘仅约 ${round1(mastGap)} m，吊钩高度 ${ta.hook_height} m 低于其塔顶 ${B.height} m，吊载有碰撞塔身风险。`,
          geometry: { kind: 'point', x: B.x, y: B.y },
          suggestions: [raiseSuggestion(cid, 1, ta, B.height + VERTICAL_CLEARANCE)],
        });
      }

      // 2b. 吊载路径进入对方大臂回转扇区
      const gap = pathSectorDist(ta.path, swingSector(B));
      const active = overlappingTasks(ta, tasksOf(B.id)).filter(
        (tb) => Math.abs(ta.hook_height - tb.hook_height) < VERTICAL_CLEARANCE,
      );

      if (gap <= MAST_GAP && active.length > 0) {
        const cid = `pathjib-${ta.id}-${B.id}`;
        const tb = active.sort((p, q) => toMillis(p.start_time) - toMillis(q.start_time))[0];
        const later = toMillis(ta.start_time) >= toMillis(tb.start_time) ? ta : tb;
        const earlier = later === ta ? tb : ta;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_JIB,
          severity: SEVERITY.HIGH,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: tb.id,
          title: `「${ta.name}」路径侵入 ${B.name} 作业臂幅区`,
          description: `吊装路径进入 ${B.name} 大臂回转扇区，且与「${tb.name}」作业时段重合、吊钩高度差 ${Math.abs(ta.hook_height - tb.hook_height)} m，存在吊载与臂架相撞风险。`,
          geometry: null,
          suggestions: [
            shiftSuggestion(cid, 1, later, toMillis(earlier.end_time)),
            raiseSuggestion(cid, 2, ta, tb.hook_height + VERTICAL_CLEARANCE),
          ],
        });
      } else if (gap <= MAST_GAP) {
        const cid = `pathjib-${ta.id}-${B.id}`;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_JIB,
          severity: SEVERITY.LOW,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: null,
          title: `「${ta.name}」路径经过 ${B.name} 臂幅区（对方无重叠作业）`,
          description: `吊装路径穿越 ${B.name} 回转扇区，该时段对方无作业计划；作业前须确认邻机停机并锁定回转，防止意外启动。`,
          geometry: null,
          suggestions: [
            { id: `${cid}-s1`, text: `作业前联系 ${B.name} 司机停机锁臂，设置回转警戒`, action: null },
          ],
        });
      } else if (gap < PATH_SAFE_GAP && active.length > 0) {
        const cid = `pathjib-${ta.id}-${B.id}`;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.PATH_JIB,
          severity: SEVERITY.MEDIUM,
          crane_a_id: A.id,
          crane_b_id: B.id,
          task_a_id: ta.id,
          task_b_id: active[0].id,
          title: `「${ta.name}」路径贴近 ${B.name} 臂幅区边界`,
          description: `路径与 ${B.name} 回转扇区边界净距约 ${round1(gap)} m（< ${PATH_SAFE_GAP} m），且存在时间重叠作业，建议拉大间距或错峰。`,
          geometry: null,
          suggestions: [
            shiftSuggestion(cid, 1, ta, Math.max(...active.map((t) => toMillis(t.end_time)))),
          ],
        });
      }
    }
  }

  // ---------- 3. 同一塔吊任务时间重叠（调度冲突） ----------
  for (const c of cranes) {
    const list = tasksOf(c.id).slice().sort((a, b) => toMillis(a.start_time) - toMillis(b.start_time));
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        if (!tasksOverlap(list[x], list[y])) continue;
        const later = list[y];
        const earlier = list[x];
        const cid = `sched-${c.id}-${earlier.id}-${later.id}`;
        conflicts.push({
          id: cid,
          type: CONFLICT_TYPE.SCHEDULE,
          severity: SEVERITY.LOW,
          crane_a_id: c.id,
          crane_b_id: null,
          task_a_id: earlier.id,
          task_b_id: later.id,
          title: `${c.name} 存在作业时段重叠：「${earlier.name}」/「${later.name}」`,
          description: '同一台塔吊同一时间只能执行一项吊装任务，当前排程存在时间重叠。',
          geometry: null,
          suggestions: [shiftSuggestion(cid, 1, later, toMillis(earlier.end_time))],
        });
      }
    }
  }

  const order = { [SEVERITY.HIGH]: 0, [SEVERITY.MEDIUM]: 1, [SEVERITY.LOW]: 2 };
  conflicts.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));

  return {
    conflicts,
    summary: {
      craneCount: cranes.length,
      taskCount: tasks.length,
      total: conflicts.length,
      high: conflicts.filter((c) => c.severity === SEVERITY.HIGH).length,
      medium: conflicts.filter((c) => c.severity === SEVERITY.MEDIUM).length,
      low: conflicts.filter((c) => c.severity === SEVERITY.LOW).length,
    },
  };
}
