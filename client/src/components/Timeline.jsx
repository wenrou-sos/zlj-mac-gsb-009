// 甘特式作业时段时间轴（06:00 - 18:00），显示任务与冲突重叠
const START_H = 6;
const END_H = 18;
const SPAN = (END_H - START_H) * 60;

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export default function Timeline({ cranes, tasks, minute, onSeek, activeTaskIds }) {
  const pct = (hhmm) => `${((toMin(hhmm) - START_H * 60) / SPAN) * 100}%`;
  const cursorPct = `${((minute - START_H * 60) / SPAN) * 100}%`;

  return (
    <div className="timeline" onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const m = START_H * 60 + ((e.clientX - rect.left) / rect.width) * SPAN;
      onSeek(Math.round(Math.max(START_H * 60, Math.min(END_H * 60 - 1, m))));
    }}>
      <div className="tl-hours">
        {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
          <span key={i} className="tl-hour" style={{ left: `${(i / (END_H - START_H)) * 100}%` }}>
            {String(START_H + i).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      {cranes.map((c) => {
        const mine = tasks.filter((t) => t.craneId === c.id);
        return (
          <div className="tl-row" key={c.id}>
            <div className="tl-crane-name" style={{ color: c.color }}>{c.name}</div>
            <div className="tl-track">
              {mine.map((t) => {
                const left = ((toMin(t.start) - START_H * 60) / SPAN) * 100;
                const width = ((toMin(t.end) - toMin(t.start)) / SPAN) * 100;
                const active = activeTaskIds?.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className={`tl-bar ${active ? 'tl-bar-active' : ''}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: c.color,
                    }}
                    title={`${t.name} ${t.start}-${t.end}`}
                  >
                    {t.name}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="tl-cursor" style={{ left: cursorPct }} />
    </div>
  );
}
