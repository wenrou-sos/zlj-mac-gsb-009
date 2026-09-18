import React, { useMemo } from 'react';
import { toMillis, fmtTime } from '../../shared/time.js';
import { CRANE_COLORS } from '../../shared/constants.js';

const colorOf = (id) => CRANE_COLORS[(id - 1) % CRANE_COLORS.length];

export default function Timeline({ cranes, tasks, analysis, playhead, onSeek, selected, onSelectTask }) {
  const { minMs, maxMs, span } = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now();
      return { minMs: now, maxMs: now + 3600_000, span: 3600_000 };
    }
    const starts = tasks.map((t) => toMillis(t.start_time));
    const ends = tasks.map((t) => toMillis(t.end_time));
    const minMs = Math.min(...starts);
    const maxMs = Math.max(...ends);
    return { minMs, maxMs, span: Math.max(1, maxMs - minMs) };
  }, [tasks]);

  // 冲突对在时间轴上的重叠区间
  const overlays = useMemo(() => {
    const out = [];
    for (const c of analysis?.conflicts || []) {
      if (!c.task_a_id || !c.task_b_id) continue;
      const a = tasks.find((t) => t.id === c.task_a_id);
      const b = tasks.find((t) => t.id === c.task_b_id);
      if (!a || !b) continue;
      const s = Math.max(toMillis(a.start_time), toMillis(b.start_time));
      const e = Math.min(toMillis(a.end_time), toMillis(b.end_time));
      if (e <= s) continue;
      const craneRows = cranes.some((x) => x.id === c.crane_a_id) ? [c.crane_a_id, c.crane_b_id].filter(Boolean) : [];
      out.push({ id: c.id, s, e, severity: c.severity, craneRows });
    }
    return out;
  }, [analysis, tasks, cranes]);

  const pct = (ms) => `${((ms - minMs) / span) * 100}%`;

  // 刻度：按跨度自动分 6 格
  const ticks = useMemo(() => {
    const step = span / 6;
    return Array.from({ length: 7 }, (_, i) => minMs + step * i);
  }, [minMs, span]);

  return (
    <div className="timeline">
      <div className="tl-header">
        <span className="tl-title">作业时段推演</span>
        <span className="tl-range">
          {fmtTime(minMs)} ~ {fmtTime(maxMs)}
        </span>
      </div>
      <div className="tl-scroll">
        {cranes.length === 0 && <div className="tl-empty">暂无塔吊</div>}
        {cranes.map((c) => {
          const rows = tasks.filter((t) => t.crane_id === c.id);
          return (
            <div className="tl-row" key={c.id}>
              <div className="tl-label" style={{ borderColor: colorOf(c.id) }}>{c.name}</div>
              <div
                className="tl-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const f = (e.clientX - rect.left) / rect.width;
                  onSeek?.(minMs + f * span);
                }}
              >
                {overlays
                  .filter((o) => o.craneRows.includes(c.id))
                  .map((o) => (
                    <div
                      key={`${o.id}-${c.id}`}
                      className={`tl-overlay sev-${o.severity} ${selected?.conflictId === o.id ? 'sel' : ''}`}
                      style={{ left: pct(o.s), width: `calc(${pct(o.e)} - ${pct(o.s)})` }}
                    />
                  ))}
                {rows.map((t) => {
                  const s = toMillis(t.start_time);
                  const e = toMillis(t.end_time);
                  return (
                    <div
                      key={t.id}
                      className={`tl-bar ${selected?.taskId === t.id ? 'sel' : ''}`}
                      style={{
                        left: pct(s),
                        width: `calc(${pct(e)} - ${pct(s)})`,
                        background: colorOf(c.id),
                      }}
                      title={`${t.name} ${fmtTime(s)}~${fmtTime(e)} 吊钩${t.hook_height}m`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectTask?.(t.id);
                      }}
                    >
                      <span>{t.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="tl-row">
          <div className="tl-label tl-scale-label">时间</div>
          <div className="tl-track tl-scale">
            {ticks.map((ms, i) => (
              <span key={i} style={{ left: `${(i / 6) * 100}%` }}>
                {new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            ))}
          </div>
        </div>
        {playhead != null && (
          <div className="tl-playhead" style={{ left: `calc(120px + ((100% - 120px) * ${(playhead - minMs) / span}))` }} />
        )}
      </div>
    </div>
  );
}
