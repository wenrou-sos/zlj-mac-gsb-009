# 🏗️ 塔吊作业冲突预演平台

可配置塔吊位置、吊臂范围、作业时段与吊装路径，自动识别**空间碰撞**与**时间冲突**，在二维场区图上回放预演并给出可一键应用的调整建议。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 塔吊配置 | 位置 (x,y)、最大/最小幅度、主朝向、扫幅（≤360°）、起重臂标高、颜色 |
| 作业任务 | 所属塔吊、起止时间、起升高度、起重臂起止角、折线路径（地图上可点击/拖拽编辑） |
| 冲突识别 | ① 臂架静态重叠（扇区相交 + 高差不足）② 同机时段冲突 ③ 吊重-吊重相撞 ④ 吊重-臂架碰撞 ⑤ 吊重穿越塔身 |
| 调整建议 | 自动顺延改期（计算当天最早可行时段）、抬升臂架、错层提高吊重、限制回转、改道绕行；支持「应用」直接回写方案 |
| 动态预演 | 时间轴拖动 / 播放（06:00–18:00），实时显示起重臂朝向、吊重位置与高度，碰撞点红色脉冲告警 |
| 数据持久化 | SQLite（sql.js / WASM，文件落盘到 `server/data/crane.db`），首次启动自动写入演示数据 |

演示数据刻意包含三类冲突：**1号↔3号臂架高差仅 1m**、**3号机 T3/T4 时段重叠 10 分钟**、**T1/T3 吊重 09:28 在 (52,52) 相撞**。

## 技术栈

- 前端：React 18 + Vite（SVG 自绘场区/扇区/路径，无重型地图依赖）
- 后端：Node.js + Express
- 数据库：SQLite（[sql.js](https://sql.js.org) WebAssembly 版本，免原生编译，数据文件持久化）
- 测试：Node 内置 `node:test`（几何、检测引擎、API 集成、服务启动冒烟，共 29 例）

## 快速开始

### 方式一：一键脚本（Linux / macOS）

```bash
./start.sh          # 装依赖 → 跑测试 → 构建前端 → 启动，浏览器打开 http://localhost:3001
./start.sh dev      # 开发模式：前端 5173（热更新）+ 后端 3001
./start.sh test     # 只跑测试
```

Windows 使用 `start.bat`（参数相同）。

### 方式二：手动启动

```bash
# 后端（端口 3001）
cd server && npm install && npm test && npm start

# 前端开发服务器（端口 5173，自动代理 /api）
cd client && npm install && npm run dev
```

生产模式下 `npm run build` 生成的 `client/dist` 会由 Express 直接托管，单端口访问。

### 方式三：Docker

```bash
docker compose up --build
# 打开 http://localhost:3001
```

数据保存在 `crane-data` 卷中；重新开始可 `docker compose down -v`。

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET/POST/PUT/DELETE | `/api/cranes[/:id]` | 塔吊增删改查（含参数校验） |
| GET/POST/PUT/DELETE | `/api/tasks[/:id]` | 吊装任务增删改查（路径为 JSON 点数组） |
| POST | `/api/analyze` | 冲突分析；body 可传 `{cranes, tasks}` 做不落库的方案试算 |
| GET | `/api/simulate?minute=568` | 某时刻（分钟）实时预演：活动任务、吊重坐标/高度、实时危险点 |
| POST | `/api/seed` | 重置为演示数据 |

## 检测模型（server/src）

- `geometry.js`：方位角/扇区几何（圆环段相交）、折线路径弧长插值、起钩-平移-落钩高度曲线、起重臂线性回转
- `engine.js`：五类冲突的静态判定与逐分钟动态采样，`findFeasibleStart` 在当天时间窗内搜索顺延可行时段，`liveHazards` 提供实时预演
- `db.js` / `seed.js` / `app.js` / `index.js`：持久化、演示数据、REST API、入口

安全阈值集中在 `geometry.js` 顶部（臂架净空 3m、吊重净空 2m、平面安全间距 3m、塔身半径 2m），可按规范调整。

## 项目结构

```
.
├── Dockerfile              # 多阶段构建：前端构建 + Node 运行时
├── docker-compose.yml
├── start.sh / start.bat    # 一键启动脚本
├── server/
│   ├── src/ (index/app/db/engine/geometry/seed)
│   └── test/ (geometry/engine/api/startup 共 29 个测试)
└── client/
    └── src/ (App + components/SiteMap、Timeline、Forms、ConflictPanel)
```

## 测试

```bash
cd server && npm test
```

- 几何单测：扇区包含、圆环段相交、路径插值、高度/回转曲线
- 引擎测试：五类冲突的正反例、错层/改期后冲突消除、实时危险点
- API 测试：CRUD、校验、级联删除、分析与预演接口
- 启动冒烟：真实拉起子进程验证 `/api/health`、演示数据与前端托管
