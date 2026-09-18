// 共享常量（server / client 通用，纯 ESM，无平台依赖）

// 垂直安全距离（米）：两处吊钩高度差小于此值，视为同一立面上的冲突
export const VERTICAL_CLEARANCE = 3;
// 水平安全包络（米）：两条吊载路径的净距小于此值，视为路径交叉风险
export const PATH_SAFE_GAP = 6;
// 塔身边缘到对方吊载的水平余量（米）
export const MAST_GAP = 0.5;

// 严重级别
export const SEVERITY = Object.freeze({
  HIGH: 'high',       // 同时作业，直接碰撞
  MEDIUM: 'medium',   // 空间重叠但时段错开
  LOW: 'low',         // 静态隐患 / 同机调度冲突
});

export const SEVERITY_LABEL = Object.freeze({
  high: '高',
  medium: '中',
  low: '低',
});

export const CONFLICT_TYPE = Object.freeze({
  MAST_HIT: 'mast-hit',             // 大臂扫过对方塔身
  JIB_OVERLAP: 'jib-overlap',       // 双大臂覆盖区重叠
  PATH_CROSS: 'path-cross',         // 吊载路径交叉
  PATH_JIB: 'path-jib',             // 路径侵入对方大臂覆盖区
  SCHEDULE: 'schedule',             // 同一塔吊任务时间重叠
});

export const CONFLICT_TYPE_LABEL = Object.freeze({
  'mast-hit': '大臂扫塔',
  'jib-overlap': '大臂空间重叠',
  'path-cross': '吊载路径交叉',
  'path-jib': '路径侵入臂幅区',
  'schedule': '同机时段冲突',
});

// 建议可执行动作
export const ACTION_TYPE = Object.freeze({
  SHIFT_TASK: 'shift-task',       // 错峰：平移任务时段
  RAISE_TASK: 'raise-task',       // 提高吊钩高度
  LIMIT_SWING: 'limit-swing',     // 限制大臂回转范围
});

// 前端色板
export const CRANE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];
