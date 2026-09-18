import React, { useRef } from 'react';

const W = 1200;
const H = 900;

function polar(cx, cy, r, bearingDeg) {
  // bearing: 0=正北 顺时针；SVG y 轴向下，直接用屏幕坐标三角函数
  const a = (bearingDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** 回转扇区（圆环段）path */
function sectorPath(crane) {
  const cx = crane.x * 10;
  const cy = crane.y * 10;
  const r1 = crane.minRadius * 10;
  const r2 = crane.maxRadius * 10;
  if (crane.sweep >= 360) {
    return [
      `M ${cx - r2} ${cy}`,
      `A ${r2} ${r2} 0 1 1 ${cx + r2} ${cy}`,
      `A ${r2} ${r2} 0 1 1 ${cx - r2} ${cy}`,
      `M ${cx - r1} ${cy}`,
      `A ${r1} ${r1} 0 1 0 ${cx + r1} ${cy}`,
      `A ${r1} ${r1} 0 1 0 ${cx - r1} ${cy}`,
    ].join(' ');
  }
  const a0 = crane.bearing - crane.sweep / 2;
  const a1 = crane.bearing + crane.sweep / 2;
  const pO0 = polar(cx, cy, r2, a0);
  const pO1 = polar(cx, cy, r2, a1);
  const pI0 = polar(cx, cy, r1, a1);
  const pI1 = polar(cx, cy, r1, a0);
  const large = crane.sweep > 180 ? 1 : 0;
  return [
    `M ${pO0.x} ${pO0.y}`,
    `A ${r2} ${r2} 0 ${large} 1 ${pO1.x} ${pO1.y}`,
    `L ${pI0.x} ${pI0.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${pI1.x} ${pI1.y}`,
    'Z',
  ].join(' ');
}

const TYPE_LABEL = {
  jib_overlap: '臂架重叠',
  schedule_overlap: '同机时段冲突',
  load_load: '吊重相撞',
  load_jib: '吊重撞臂',
  load_tower: '穿越塔身',
};

export default function SiteMap({
  cranes,
  tasks,
  conflicts,
  sim,
  minute,
  playing,
  editingTask,
  activeTaskIds,
  onMapClick,
  onMapDoubleClick,
  onDragPoint,
}) {
  const svgRef = useRef(null);
  const dragging = useRef(null);
  const lastDblClick = useRef(0);

  const craneById = new Map(cranes.map((c) => [c.id, c]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  function toWorld(evt) {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 120;
    const y = ((evt.clientY - rect.top) / rect.height) * 90;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function pointPointerDown(evt, idx) {
    if (!editingTask) return;
    evt.stopPropagation();
    dragging.current = idx;
    evt.target.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt) {
    if (dragging.current === null) return;
    const p = toWorld(evt);
    onDragPoint(dragging.current, p);
  }

  function onPointerUp() {
    dragging.current = null;
  }

  // 实时预演中每台塔吊臂架的当前朝向
  const bearingByCrane = new Map();
  if (sim) {
    for (const pos of sim.positions) bearingByCrane.set(pos.craneId, pos.bearing);
  }

  return (
    <svg
      ref={svgRef}
      className="sitemap"
      viewBox={`0 0 ${W} ${H}`}
      onClick={(e) => {
        if (dragging.current !== null) return;
        if (editingTask && e.target === svgRef.current) {
          // 抑制双击合成前的 click，避免误加路径点
          if (Date.now() - lastDblClick.current < 400) return;
          onMapClick(toWorld(e));
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        if (editingTask) {
          e.preventDefault();
          lastDblClick.current = Date.now();
          onMapDoubleClick?.(toWorld(e));
        }
      }}
    >
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1e293b" strokeWidth="1" />
        </pattern>
        <pattern id="grid-major" width="250" height="250" patternUnits="userSpaceOnUse">
          <rect width="250" height="250" fill="url(#grid)" />
          <path d="M 250 0 L 0 0 0 250" fill="none" stroke="#334155" strokeWidth="1.5" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={W} height={H} fill="url(#grid-major)" />

      {/* 塔吊回转扇区 */}
      {cranes.map((c) => {
        const simActive = sim?.positions.some((p) => p.craneId === c.id);
        return (
          <path
            key={`sector-${c.id}`}
            d={sectorPath(c)}
            fill={c.color}
            fillOpacity={simActive ? 0.16 : 0.09}
            stroke={c.color}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            fillRule="evenodd"
          />
        );
      })}

      {/* 任务路径 */}
      {tasks.map((t) => {
        const crane = craneById.get(t.craneId);
        if (!crane || t.path.length < 2) return null;
        const active = (sim?.activeTaskIds || []).includes(t.id) || activeTaskIds?.includes(t.id);
        const isEditing = editingTask?.id === t.id;
        const d = t.path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 10} ${p.y * 10}`).join(' ');
        return (
          <g key={`path-${t.id}`}>
            <path
              d={d}
              fill="none"
              stroke={crane.color}
              strokeWidth={isEditing ? 5 : active ? 4 : 2.5}
              strokeOpacity={active || isEditing ? 1 : 0.35}
              strokeDasharray={isEditing ? '0' : '10 7'}
            />
            {t.path.map((p, i) => (
              <circle
                key={i}
                cx={p.x * 10}
                cy={p.y * 10}
                r={isEditing ? 9 : 5}
                fill={i === 0 ? '#22c55e' : i === t.path.length - 1 ? '#ef4444' : crane.color}
                stroke="#0f172a"
                strokeWidth={2}
                style={{ cursor: isEditing ? 'grab' : 'default' }}
                onPointerDown={(e) => pointPointerDown(e, i)}
              />
            ))}
          </g>
        );
      })}

      {/* 实时臂架朝向与吊重 */}
      {sim &&
        cranes.map((c) => {
          const bearing = bearingByCrane.get(c.id);
          if (bearing === undefined) return null;
          const tip = polar(c.x * 10, c.y * 10, c.maxRadius * 10, bearing);
          const inner = polar(c.x * 10, c.y * 10, c.minRadius * 10, bearing);
          return (
            <line
              key={`jib-${c.id}`}
              x1={inner.x}
              y1={inner.y}
              x2={tip.x}
              y2={tip.y}
              stroke={c.color}
              strokeWidth={5}
              strokeLinecap="round"
            />
          );
        })}
      {sim?.positions.map((p) => (
        <g key={`load-${p.taskId}`}>
          <circle cx={p.x * 10} cy={p.y * 10} r={14} fill="#f97316" stroke="#fff" strokeWidth={2.5} />
          <text x={p.x * 10} y={p.y * 10 + 30} textAnchor="middle" className="map-label">
            {p.height.toFixed(0)}m
          </text>
        </g>
      ))}

      {/* 实时危险点 */}
      {sim?.hazards.map((h, i) => (
        <g key={`hazard-${i}`}>
          <circle cx={h.x * 10} cy={h.y * 10} r={22} fill="none" stroke="#ef4444" strokeWidth={4}>
            <animate attributeName="r" values="16;30;16" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* 塔吊本体 */}
      {cranes.map((c) => (
        <g key={`crane-${c.id}`}>
          <rect x={c.x * 10 - 11} y={c.y * 10 - 11} width={22} height={22} fill="#0f172a" stroke={c.color} strokeWidth={3} />
          <text x={c.x * 10} y={c.y * 10 - 20} textAnchor="middle" className="map-label" fill={c.color}>
            {c.name} · {c.jibHeight}m
          </text>
        </g>
      ))}

      {/* 计划冲突标记 */}
      {(!sim || !playing) &&
        conflicts.map((cf, i) => (
          <g key={`cf-${cf.id}`} className={activeTaskIds?.length ? '' : ''}>
            <text
              x={cf.at.x * 10}
              y={cf.at.y * 10 - 22 - (i % 3) * 16}
              textAnchor="middle"
              className={`conflict-badge conflict-badge-${cf.severity}`}
            >
              ⚠ {TYPE_LABEL[cf.type] || cf.type}
            </text>
          </g>
        ))}

      {editingTask && (
        <text x={20} y={H - 20} className="map-hint">
          路径编辑：点击空白处追加途经点，拖动绿/红圆点调整起终点，双击任务可删除末点
        </text>
      )}
    </svg>
  );
}
