const TYPE_LABEL = {
  jib_overlap: '臂架静态重叠',
  schedule_overlap: '同机时段冲突',
  load_load: '吊重空间碰撞',
  load_jib: '吊重-臂架碰撞',
  load_tower: '吊重穿越塔身',
};

const ACTION_LABEL = {
  reschedule: '改期避让',
  raise_jib: '抬升臂架',
  limit_slew: '限制回转',
  raise_load: '提高吊重',
  reroute: '改道绕行',
  manual: '人工协调',
};

export default function ConflictPanel({ conflicts, summary, onApply, onLocate, dimmed }) {
  return (
    <div className={`conflict-panel ${dimmed ? 'dimmed' : ''}`}>
      <div className="summary-row">
        <span className="summary-pill total">共 {summary.total} 项</span>
        <span className="summary-pill high">高 {summary.high}</span>
        <span className="summary-pill medium">中 {summary.medium}</span>
        <span className="summary-pill low">低 {summary.low}</span>
      </div>

      {conflicts.length === 0 && (
        <div className="all-clear">
          <div className="all-clear-icon">✓</div>
          <div>未检测到冲突，方案可以执行</div>
        </div>
      )}

      {conflicts.map((cf) => (
        <div key={cf.id} className={`conflict-card severity-${cf.severity}`}>
          <div className="conflict-head" onClick={() => onLocate?.(cf)}>
            <span className="conflict-type">{TYPE_LABEL[cf.type] || cf.type}</span>
            <span className={`sev-tag sev-${cf.severity}`}>{cf.severity === 'high' ? '高风险' : cf.severity === 'medium' ? '中风险' : '低风险'}</span>
            {cf.firstAt && <span className="conflict-time">⏱ {cf.firstAt}</span>}
          </div>
          <p className="conflict-msg">{cf.message}</p>
          <div className="suggestions">
            <div className="suggestions-title">调整建议：</div>
            {cf.suggestions.map((s, i) => (
              <div key={i} className="suggestion">
                <span className="sug-action">{ACTION_LABEL[s.action] || s.action}</span>
                <span className="sug-desc">{s.description}</span>
                {onApply && (
                  <button className="btn-apply" onClick={() => onApply(s, cf)}>
                    应用
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
