import React, { useEffect, useState } from 'react';
import { CRANE_COLORS } from '../../shared/constants.js';

const EMPTY = {
  name: '',
  x: 200,
  y: 200,
  jib_length: 50,
  height: 60,
  mast_radius: 1.6,
  swing_start: 0,
  swing_sweep: 360,
};

export default function CraneForm({ crane, onSubmit, onCancel, error }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (crane) {
      const { created_at, ...rest } = crane;
      setForm({ ...EMPTY, ...rest });
    } else {
      setForm(EMPTY);
    }
  }, [crane]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  return (
    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="form-title">{crane ? `编辑塔吊 #${crane.id}` : '新增塔吊'}
        {crane && <i className="form-dot" style={{ background: CRANE_COLORS[(crane.id - 1) % CRANE_COLORS.length] }} />}
      </div>
      {error && <div className="form-error">{error}</div>}

      <label>名称<input value={form.name} onChange={set('name')} placeholder="如：5#塔吊" required /></label>
      <div className="form-row">
        <label>X 坐标 (m)<input type="number" step="0.1" value={form.x} onChange={set('x')} required /></label>
        <label>Y 坐标 (m)<input type="number" step="0.1" value={form.y} onChange={set('y')} required /></label>
      </div>
      <div className="form-row">
        <label>臂长 (m)<input type="number" step="0.1" min="1" value={form.jib_length} onChange={set('jib_length')} /></label>
        <label>塔高 (m)<input type="number" step="0.1" min="1" value={form.height} onChange={set('height')} /></label>
      </div>
      <div className="form-row">
        <label>塔身半径 (m)<input type="number" step="0.1" min="0.1" value={form.mast_radius} onChange={set('mast_radius')} /></label>
      </div>
      <div className="form-row">
        <label>回转起始角 (°)<input type="number" step="1" value={form.swing_start} onChange={set('swing_start')} /></label>
        <label>扇区角度 (°)<input type="number" step="1" min="1" max="360" value={form.swing_sweep} onChange={set('swing_sweep')} /></label>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-primary">{crane ? '保存' : '添加'}</button>
        {crane && <button type="button" className="btn-ghost" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}
