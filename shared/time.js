// 时间工具：前端使用 datetime-local 的本地时间字符串（YYYY-MM-DDTHH:mm），
// 统一通过 Date 解析为毫秒时间戳参与计算。

export const toMillis = (s) => new Date(s).getTime();

// 两个半开时间区间是否重叠（端点相接不算冲突，便于连续作业）
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function tasksOverlap(t1, t2) {
  return rangesOverlap(
    toMillis(t1.start_time),
    toMillis(t1.end_time),
    toMillis(t2.start_time),
    toMillis(t2.end_time),
  );
}

// 把任务整体平移到从 newStart（毫秒）开始，返回新的本地时间字符串
export function shiftTaskTo(task, newStartMs) {
  const dur = toMillis(task.end_time) - toMillis(task.start_time);
  return {
    start_time: toLocalInput(newStartMs),
    end_time: toLocalInput(newStartMs + dur),
  };
}

// Date -> datetime-local 字符串（本地时区）
export function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function durationMinutes(task) {
  return Math.round((toMillis(task.end_time) - toMillis(task.start_time)) / 60000);
}

export function fmtTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 在当前时间上增加分钟，返回 datetime-local 字符串
export function minutesFromNow(min) {
  return toLocalInput(Date.now() + min * 60000);
}
