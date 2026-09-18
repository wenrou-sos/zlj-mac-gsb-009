import React, { useEffect, useState } from 'react';
import { CRANE_COLORS } from '../../shared/constants.js';
import { toLocalInput, minutesFromNow } from '../../shared/time.js';

const EMPTY = {
  crane_id: '',
  name: '',
  start_time: minutesFromNow(0),
  end_time: minutesFromNow(60),
  hook_height: 25,
  load_weight: 1,
  note: '',
  path: [],
};

export default function TaskForm({ task, cranes, onSubmit, onCancel, onStartPath, pathDraft, committedPath, onPathAction, error }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (task) {
      const { created_at, ...rest } = task;
      setForm({ ...EMPTY, ...rest, crane_id: rest.crane_id ?? '', path: rest.path || [] });
    } else {
      setForm((f) => ({ ...EMPTY, crane_id: cranes[0]?.id ?? '', path: committedPath ?? [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, cranes]);

  // 路径在画布上绘制完成后固化进表单
  useEffect(() => {
    if (committedPath) setForm((f) => ({ ...f, path: committedPath }));
  }, [committedPath]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const draftCount = pathDraft?.length || 0;

  return (
    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...form, path: pathDraft ? pathDraft : form.path });
      }}
    >
      <div className="form-title">{task ? `编辑任务 #${task.id}` : '新增吊装任务'}</div>
      {error && <div className="form-error">{error}</div>}

      <label>
        所属塔吊
        <select value={form.crane_id} onChange={set('crane_id')} required>
          <option value="" disabled>请选择…</option>
          {cranes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（塔高 {c.height}m）
            </option>
          ))}
        </select>
      </label>
      <label>任务名称<input value={form.name} onChange={set('name')} placeholder="如：钢梁吊装" required /></label>
      <div className="form-row">
        <label>开始时间<input type="datetime-local" value={form.start_time} onChange={set('start_time')} required /></label>
        <label>结束时间<input type="datetime-local" value={form.end_time} onChange={set('end_time')} required /></label>
      </div>
      <div className="form-row">
        <label>吊钩高度 (m)<input type="number" step="0.5" min="1" value={form.hook_height} onChange={set('hook_height')} /></label>
        <label>吊重 (t)<input type="number" step="0.1" min="0" value={form.load_weight} onChange={set('load_weight')} /></label>
      </div>

      <div className="path-editor">
        <div className="path-editor-head">
          <span>吊装路径</span>
          {!pathDraft ? (
            <button type="button" className="btn-mini" onClick={onStartPath}>
              在图上绘制 {form.path.length > 0 ? `（当前 ${form.path.length} 点）` : ''}
            </button>
          ) : (
            <span className="path-actions">
              <b>{draftCount}</b> 点
              <button type="button" className="btn-mini" onClick={() => onPathAction('undo')}>撤销</button>
              <button type="button" className="btn-mini" onClick={() => onPathAction('cancel')}>取消</button>
              <button type="button" className="btn-mini primary" disabled={draftCount < 2} onClick={() => onPathAction('done')}>
                完成
              </button>
            </span>
          )}
        </div>
        <div className="path-points">
          {(pathDraft || form.path).length === 0 && <span className="muted">未设置路径（仅检测臂幅与塔身）</span>}
          {(pathDraft || form.path).map((p, i) => (
            <span key={i} className="path-chip">P{i + 1}: {p.x}, {p.y}</span>
          ))}
        </div>
        {pathDraft && <div className="path-hint">在平面图上单击添加路径点，完成后点击「完成」</div>}
      </div>

      <label>备注<input value={form.note} onChange={set('note')} placeholder="可选" /></label>

      <div className="form-actions">
        <button type="submit" className="btn-primary">{task ? '保存' : '添加'}</button>
        {task && <button type="button" className="btn-ghost" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}
