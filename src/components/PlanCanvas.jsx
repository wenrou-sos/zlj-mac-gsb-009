import React, { useMemo, useRef } from 'react';
import { DEG, dist } from '../../shared/geometry.js';
import { toMillis } from '../../shared/time.js';
import { CRANE_COLORS } from '../../shared/constants.js';

// 沿折线按弧长比例取点
function pointAtFraction(points, f) {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const lens = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    lens.push(l);
    total += l;
  }
  if (total === 0) return points[0];
  let target = clamp(f, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i]) {
      const t = lens[i] === 0 ? 0 : target / lens[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    target -= lens[i];
  }
  return points[points.length - 1];
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function sectorPath(c) {
  const a0 = c.swing_start * DEG;
  const a1 = (c.swing_start + c.swing_sweep) * DEG;
  const x1 = c.x + c.jib_length * Math.cos(a0);
  const y1 = c.y + c.jib_length * Math.sin(a0);
  const x2 = c.x + c.jib_length * Math.cos(a1);
  const y2 = c.y + c.jib_length * Math.sin(a1);
  const large = c.swing_sweep > 180 ? 1 : 0;
  return `M ${c.x} ${c.y} L ${x1} ${y1} A ${c.jib_length} ${c.jib_length} 0 ${large} 1 ${x2} ${y2} Z`;
}

const colorOf = (craneId) => CRANE_COLORS[(craneId - 1) % CRANE_COLORS.length];

export default function PlanCanvas({
  cranes,
  tasks,
  analysis,
  selected,
  onSelectCrane,
  pathDraft,
  onCanvasPoint,
  playhead,
}) {
  const svgRef = useRef(null);

  const bounds = useMemo(() => {
    const pts = [];
    cranes.forEach((c) => pts.push({ x: c.x, y: c.y }));
    tasks.forEach((t) => (t.path || []).forEach((p) => pts.push(p)));
    if (pts.length === 0) return { minX: 0, minY: 0, w: 360, h: 300 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + 40;
    const maxY = Math.max(...ys) + 40;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [cranes, tasks]);

  // 推演时刻下的吊钩位置
  const hookAt = useMemo(() => {
    if (playhead == null) return new Map();
    const map = new Map();
    for (const t of tasks) {
      const s = toMillis(t.start_time);
      const e = toMillis(t.end_time);
      if (playhead < s || playhead > e || !(t.path || []).length) continue;
      map.set(t.id, pointAtFraction(t.path, (playhead - s) / (e - s)));
    }
    return map;
  }, [tasks, playhead]);

  const activeTaskIds = useMemo(() => new Set([...hookAt.keys()]), [hookAt]);

  const witnessPoints = useMemo(() => {
    const out = [];
    for (const c of analysis?.conflicts || []) {
      if (c.geometry?.kind === 'point') out.push({ ...c.geometry, id: c.id, dim: c.severity === 'low' });
    }
    return out;
  }, [analysis]);

  const related = useMemo(() => {
    const c = analysis?.conflicts?.find((x) => x.id === selected?.conflictId);
    if (!c) return { cranes: new Set(), tasks: new Set() };
    return {
      cranes: new Set([c.crane_a_id, c.crane_b_id].filter(Boolean)),
      tasks: new Set([c.task_a_id, c.task_b_id].filter(Boolean)),
    };
  }, [analysis, selected]);

  const vbW = Math.max(bounds.w, bounds.h * 1.5);
  const viewBox = `${bounds.minX} ${bounds.minY} ${vbW} ${Math.max(bounds.h, vbW / 1.5)}`;

  function handleSvgClick(e) {
    if (!onCanvasPoint || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    onCanvasPoint({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  }

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className={`plan-svg ${pathDraft ? 'path-drawing' : ''}`}
        onClick={handleSvgClick}
      >
        {/* 网格 */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={bounds.minX} y={bounds.minY} width={vbW} height={Math.max(bounds.h, vbW / 1.5)} fill="url(#grid)" />

        {/* 回转扇区 */}
        {cranes.map((c) => {
          const isSel = selected?.craneId === c.id;
          const hot = related.cranes.has(c.id);
          return (
            <path
              key={`sec-${c.id}`}
              d={sectorPath(c)}
              fill={colorOf(c.id)}
              fillOpacity={isSel || hot ? 0.16 : 0.07}
              stroke={colorOf(c.id)}
              strokeWidth={isSel || hot ? 1.2 : 0.6}
              strokeDasharray="3 2"
              className="sector"
            />
          );
        })}

        {/* 任务路径 */}
        {tasks.map((t) => {
          const pts = t.path || [];
          if (pts.length < 2) return null;
          const c = cranes.find((x) => x.id === t.crane_id);
          const color = colorOf(t.crane_id);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const hot = related.tasks.has(t.id);
          const active = activeTaskIds.has(t.id);
          return (
            <g key={`path-${t.id}`} className={hot ? 'hot' : ''}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={hot ? 1.6 : 1}
                strokeDasharray={active ? 'none' : '4 2'}
                className={active ? 'path-active' : ''}
                opacity={playhead != null && !active ? 0.35 : 1}
              />
              <circle cx={pts[0].x} cy={pts[0].y} r={1.4} fill={color} stroke="#fff" strokeWidth={0.4} />
              <rect x={pts[pts.length - 1].x - 1.6} y={pts[pts.length - 1].y - 1.6} width={3.2} height={3.2} fill={color} stroke="#fff" strokeWidth={0.4} />
            </g>
          );
        })}

        {/* 路径编辑草稿 */}
        {pathDraft && pathDraft.length > 0 && (
          <g>
            <polyline
              points={pathDraft.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.2}
              strokeDasharray="3 2"
            />
            {pathDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="#f59e0b" />
            ))}
          </g>
        )}

        {/* 塔吊符号 */}
        {cranes.map((c) => {
          const color = colorOf(c.id);
          const isSel = selected?.craneId === c.id;
          const hot = related.cranes.has(c.id);
          const activeT = tasks.find((t) => t.crane_id === c.id && activeTaskIds.has(t.id));
          let jibAng = (c.swing_start + c.swing_sweep / 2) * DEG;
          if (activeT) {
            const hook = hookAt.get(activeT.id);
            if (hook) jibAng = Math.atan2(hook.y - c.y, hook.x - c.x);
          }
          const jx = c.x + c.jib_length * Math.cos(jibAng);
          const jy = c.y + c.jib_length * Math.sin(jibAng);
          return (
            <g
              key={`crane-${c.id}`}
              className="crane-symbol"
              onClick={(e) => {
                e.stopPropagation();
                onSelectCrane?.(c.id);
              }}
            >
              {activeT && (
                <line x1={c.x} y1={c.y} x2={jx} y2={jy} stroke={color} strokeWidth={1.4} opacity={0.9} />
              )}
              {/* 平衡臂 */}
              <line
                x1={c.x}
                y1={c.y}
                x2={c.x - 10 * Math.cos(jibAng)}
                y2={c.y - 10 * Math.sin(jibAng)}
                stroke={color}
                strokeWidth={1.2}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={2.6}
                fill="#fff"
                stroke={color}
                strokeWidth={isSel || hot ? 1.8 : 1.2}
              />
              <circle cx={c.x} cy={c.y} r={0.9} fill={color} />
              <text x={c.x} y={c.y - 4.5} textAnchor="middle" fontSize={4.6} fontWeight={700} fill="#111827">
                {c.name}
              </text>
              <text x={c.x} y={c.y + 8} textAnchor="middle" fontSize={3.4} fill="#6b7280">
                H{c.height}m / R{c.jib_length}m
              </text>
            </g>
          );
        })}

        {/* 推演吊钩 */}
        {[...hookAt.entries()].map(([tid, p]) => {
          const t = tasks.find((x) => x.id === tid);
          return (
            <g key={`hook-${tid}`}>
              <line x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y} stroke="#111827" strokeWidth={0.5} strokeDasharray="1 1" />
              <circle cx={p.x} cy={p.y} r={2} fill="#ef4444" stroke="#fff" strokeWidth={0.5} className="hook" />
              <text x={p.x + 3} y={p.y - 3} fontSize={3.2} fill="#b91c1c">
                {t.hook_height}m
              </text>
            </g>
          );
        })}

        {/* 冲突见证点 */}
        {witnessPoints.map((w) => (
          <g key={`w-${w.id}`} className={selected?.conflictId === w.id ? 'witness-sel' : ''}>
            <circle cx={w.x} cy={w.y} r={w.dim ? 2.4 : 3.2} fill="none" stroke="#dc2626" strokeWidth={0.8} className="witness" />
            <circle cx={w.x} cy={w.y} r={1} fill="#dc2626" />
          </g>
        ))}
      </svg>
      <div className="canvas-legend">
        <span><i className="lg-circle" /> 塔吊</span>
        <span><i className="lg-dash" /> 回转扇区</span>
        <span><i className="lg-path" /> 吊装路径（□ 终点）</span>
        <span><i className="lg-hook" /> 推演吊钩</span>
        <span><i className="lg-warn" /> 冲突点</span>
      </div>
    </div>
  );
}
