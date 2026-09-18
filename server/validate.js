// 输入校验：返回 { value, errors }
import { normDeg } from '../shared/geometry.js';
import { toMillis } from '../shared/time.js';

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function validateCrane(body, { partial = false } = {}) {
  const errors = [];
  const value = {};

  const take = (key, def, check, msg) => {
    if (!(key in body)) {
      if (!partial) value[key] = def;
      return;
    }
    value[key] = check(body[key]) ? body[key] : def;
    if (!check(body[key])) errors.push(msg);
  };

  if ('name' in body) value.name = str(body.name).slice(0, 40);
  else if (!partial) value.name = '';
  if (!value.name) errors.push('塔吊名称不能为空');

  take('x', 0, (v) => typeof v === 'number' && v >= 0 && v <= 1000, 'x 坐标需在 0~1000 m');
  take('y', 0, (v) => typeof v === 'number' && v >= 0 && v <= 1000, 'y 坐标需在 0~1000 m');
  take('jib_length', 50, (v) => typeof v === 'number' && v > 0 && v <= 150, '臂长需在 0~150 m');
  take('height', 60, (v) => typeof v === 'number' && v > 0 && v <= 400, '塔高需在 0~400 m');
  take('mast_radius', 1.6, (v) => typeof v === 'number' && v > 0 && v <= 5, '塔身半径需在 0~5 m');
  take('swing_start', 0, (v) => typeof v === 'number', '回转起始角需为数字');
  take('swing_sweep', 360, (v) => typeof v === 'number' && v > 0 && v <= 360, '回转扇区角度需在 0~360°');

  if (value.swing_start !== undefined) value.swing_start = normDeg(value.swing_start);
  return { value, errors };
}

export function validateTask(body, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if ('name' in body) value.name = str(body.name).slice(0, 60);
  else if (!partial) value.name = '';
  if (!value.name) errors.push('任务名称不能为空');

  if ('crane_id' in body) value.crane_id = Number(body.crane_id);
  else if (!partial) value.crane_id = NaN;
  if (!Number.isInteger(value.crane_id)) errors.push('必须选择所属塔吊');

  for (const key of ['start_time', 'end_time']) {
    if (key in body) value[key] = body[key];
    else if (!partial) value[key] = '';
    if (!value[key] || Number.isNaN(toMillis(value[key]))) errors.push(`${key === 'start_time' ? '开始' : '结束'}时间格式无效`);
  }
  if (value.start_time && value.end_time && !Number.isNaN(toMillis(value.start_time)) && !Number.isNaN(toMillis(value.end_time))) {
    if (toMillis(value.end_time) <= toMillis(value.start_time)) errors.push('结束时间必须晚于开始时间');
  }

  value.hook_height = num(body.hook_height, 20);
  if (!(value.hook_height > 0 && value.hook_height <= 400)) errors.push('吊钩高度需在 0~400 m');
  value.load_weight = Math.max(0, num(body.load_weight, 0));
  value.note = str(body.note ?? '').slice(0, 200);

  value.path = Array.isArray(body.path) ? body.path : [];
  value.path = value.path
    .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x, y: p.y }));
  if (value.path.length === 1) errors.push('吊装路径至少需要两个路径点');

  return { value, errors };
}
