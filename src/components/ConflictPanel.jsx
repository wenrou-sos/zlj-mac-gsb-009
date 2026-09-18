import React from 'react';
import { CONFLICT_TYPE_LABEL, SEVERITY_LABEL } from '../../shared/constants.js';

export default function ConflictPanel({ analysis, selected, onSelect, onApply, busyId }) {
  const conflicts = analysis?.conflicts || [];
  const summary = analysis?.summary;

  return (
    <div className="conflict-panel">
      <div className="cp-summary">
        <div className="cp-total">
          <strong className={summary?.high > 0 ? 'text-danger' : 'text-ok'}>{summary?.total ?? 0}</strong>
          <span>项风险</span>
        </div>
        <div className="cp-counts">
          <span className="badge sev-high">高 {summary?.high ?? 0}</span>
          <span className="badge sev-medium">中 {summary?.medium ?? 0}</span>
          <span className="badge sev-low">低 {summary?.low ?? 0}</span>
        </div>
      </div>

      {conflicts.length === 0 && (
        <div className="cp-empty">
          <div className="cp-empty-icon">✓</div>
          未发现空间碰撞或时间冲突，当前计划可执行
        </div>
      )}

      <div className="cp-list">
        {conflicts.map((c) => (
          <div
            key={c.id}
            className={`conflict-card sev-${c.severity} ${selected?.conflictId === c.id ? 'sel' : ''}`}
            onClick={() => onSelect?.(c.id)}
          >
            <div className="cc-head">
              <span className={`dot sev-${c.severity}`} />
              <span className="cc-type">{CONFLICT_TYPE_LABEL[c.type]}</span>
              <span className={`badge sev-${c.severity}`}>{SEVERITY_LABEL[c.severity]}</span>
            </div>
            <div className="cc-title">{c.title}</div>
            <div className="cc-desc">{c.description}</div>
            {c.suggestions.length > 0 && (
              <div className="cc-sugs">
                <div className="cc-sugs-label">调整建议：</div>
                {c.suggestions.map((s) => (
                  <div className="cc-sug" key={s.id}>
                    <span>{s.text}</span>
                    {s.action && (
                      <button
                        className="btn-apply"
                        disabled={busyId === s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApply?.(s, c);
                        }}
                      >
                        {busyId === s.id ? '应用中…' : '应用'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
