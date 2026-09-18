import { useState } from 'react';

const DEFAULT_CRANE = {
  name: '',
  x: 60,
  y: 45,
  maxRadius: 35,
  minRadius: 4,
  bearing: 0,
  sweep: 360,
  jibHeight: 30,
  color: '#38bdf8',
};

const COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

export function CraneForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({ ...DEFAULT_CRANE, ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        名称
        <input value={form.name} onChange={set('name')} placeholder="如：4号塔吊" required />
      </label>
      <div className="form-row">
        <label>
          X 坐标 (m)
          <input type="number" step="0.5" min="0" max="120" value={form.x} onChange={set('x')} />
        </label>
        <label>
          Y 坐标 (m)
          <input type="number" step="0.5" min="0" max="90" value={form.y} onChange={set('y')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          最大幅度 (m)
          <input type="number" step="0.5" min="1" value={form.maxRadius} onChange={set('maxRadius')} />
        </label>
        <label>
          最小幅度 (m)
          <input type="number" step="0.5" min="0" value={form.minRadius} onChange={set('minRadius')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          主朝向 (°)
          <input type="number" step="1" min="0" max="360" value={form.bearing} onChange={set('bearing')} />
        </label>
        <label>
          扫幅 (°，360=全回转)
          <input type="number" step="1" min="10" max="360" value={form.sweep} onChange={set('sweep')} />
        </label>
      </div>
      <label>
        起重臂标高 (m)
        <input type="number" step="0.5" min="1" value={form.jibHeight} onChange={set('jibHeight')} />
      </label>
      <label>
        颜色
        <div className="color-row">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`color-dot ${form.color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setForm({ ...form, color: c })}
            />
          ))}
        </div>
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn-primary">保存</button>
        {onCancel && (
          <button type="button" onClick={onCancel}>取消</button>
        )}
      </div>
    </form>
  );
}

export function TaskForm({ cranes, initial, pathDraft, onSubmit, onCancel, onTogglePathEdit }) {
  const [form, setForm] = useState({
    craneId: cranes[0]?.id,
    name: '',
    start: '09:00',
    end: '09:30',
    liftHeight: 20,
    jibStart: 0,
    jibEnd: 90,
    path: [{ x: 20, y: 20 }, { x: 50, y: 40 }],
    ...initial,
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const editing = pathDraft !== null;
  const shownPath = editing ? pathDraft : form.path;

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({ ...form, path: shownPath });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        任务名称
        <input value={form.name} onChange={set('name')} placeholder="如：钢梁吊装" required />
      </label>
      <label>
        所属塔吊
        <select value={form.craneId} onChange={set('craneId')}>
          {cranes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          开始
          <input type="time" value={form.start} onChange={set('start')} />
        </label>
        <label>
          结束
          <input type="time" value={form.end} onChange={set('end')} />
        </label>
      </div>
      <label>
        起升高度 (m)
        <input type="number" step="0.5" min="1" value={form.liftHeight} onChange={set('liftHeight')} />
      </label>
      <div className="form-row">
        <label>
          起重臂起始角 (°)
          <input type="number" step="1" min="0" max="360" value={form.jibStart} onChange={set('jibStart')} />
        </label>
        <label>
          起重臂结束角 (°)
          <input type="number" step="1" min="0" max="360" value={form.jibEnd} onChange={set('jibEnd')} />
        </label>
      </div>
      <div className="path-box">
        <div className="path-box-head">
          <span>吊装路径（{shownPath.length} 点）</span>
          <button type="button" className={`btn-mini ${editing ? 'btn-mini-active' : ''}`} onClick={() => onTogglePathEdit(form)}>
            {editing ? '完成地图编辑' : '在地图上编辑'}
          </button>
        </div>
        <div className="path-points">
          {shownPath.map((p, i) => (
            <span key={i} className="path-point">
              {i === 0 ? '起' : i === shownPath.length - 1 ? '终' : i + 1}({p.x.toFixed(1)}, {p.y.toFixed(1)})
            </span>
          ))}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn-primary">保存</button>
        {onCancel && <button type="button" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}
