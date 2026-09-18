# 塔吊作业冲突预演平台

面向群塔作业的**冲突预演与方案校验平台**：在平面布置图上配置塔吊位置、臂长与回转范围，编排各塔吊的作业时段、吊钩高度与吊装路径，系统自动识别**空间碰撞**与**时间冲突**，按高 / 中 / 低三级输出风险，并给出可**一键应用**的调整建议（错峰、抬钩、限幅）。

## 功能

- **塔吊配置**：坐标、臂长、塔高、塔身半径、回转起始角与扇区角度（支持受限回转扇区）
- **吊装任务**：所属塔吊、作业时段、吊钩高度、吊重，以及在平面图上**点击绘制**的折线路径
- **五类冲突自动识别**
  | 类型 | 判定依据 | 典型建议 |
  | --- | --- | --- |
  | 大臂扫塔 `mast-hit` | 邻机塔心落入本机回转扇区且臂顶高差不足 | 限制作业半径（限幅） |
  | 大臂空间重叠 `jib-overlap` | 双机回转扇区相交 + 时段重合 + 吊钩同高 | 错峰作业 |
  | 吊载路径交叉 `path-cross` | 两路径净距 < 6m 安全包络 | 错峰 / 抬高吊钩 |
  | 路径侵入臂幅区 `path-jib` | 路径进入邻机回转扇区 | 错峰 / 抬钩 / 停机锁臂 |
  | 同机时段冲突 `schedule` | 同一塔吊任务时间重叠 | 任务顺延 |
- **作业推演**：时间轴甘特图播放，吊钩沿路径运动，直观看出碰撞时刻
- **冲突联动定位**：点击风险项，平面图高亮相关塔吊 / 路径并标注冲突点，甘特图标注重叠时段
- 数据持久化于 **SQLite**（better-sqlite3），首次启动自动写入覆盖全部冲突类型的演示数据

## 技术栈

- 前端：React 18 + Vite（SVG 自绘平面图与甘特图，无重型 GIS 依赖）
- 后端：Node.js 原生 `http`（零 Web 框架依赖）+ better-sqlite3
- 测试：Vitest（几何引擎 11 项 + 冲突分析 16 项 + HTTP API 8 项，共 35 项）
- 部署：多阶段 Dockerfile，单容器同时托管 API 与前端静态资源

## 快速开始

### 方式一：Docker（推荐）

```bash
./start.sh            # Windows 双击或执行 start.bat
# 或手动：
docker compose up -d --build
```

打开 http://localhost:4000 。数据保存在命名卷 `crane-data` 中。

### 方式二：本地 Node（需 Node.js ≥ 20）

```bash
./start.sh local
# 或手动：
npm install
npm run build
npm start            # http://localhost:4000
```

> `better-sqlite3` 是原生模块，安装时需要 python3 / make / g++（多数系统自带；Linux 上如编译失败可 `apt install python3 make g++`）。

### 脚本命令

| 命令 | 作用 |
| --- | --- |
| `./start.sh` | 自动选择 Docker 或本地模式启动 |
| `./start.sh docker` / `local` | 强制指定启动方式 |
| `./start.sh test` | 运行全部测试 |
| `./start.sh stop` | 停止容器 |
| `./start.sh reset` | 停止并清空数据库（恢复演示数据） |

### 开发模式

```bash
npm run dev          # Node 后端（:4000，文件变更自动重启）
npm run dev:web      # Vite 前端热更新（:5173，自动代理 /api 到 :4000）
npm test             # 单次测试；npm run test:watch 监听模式
```

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/state` | 塔吊 + 任务 + 冲突分析全量数据 |
| POST | `/api/analyze` | 对请求体中的临时方案做冲突分析（不落库） |
| POST/GET | `/api/cranes` | 新增 / 列出塔吊 |
| PUT/PATCH/DELETE | `/api/cranes/:id` | 更新 / 删除塔吊（级联删除任务） |
| POST/GET | `/api/tasks` | 新增 / 列出任务（路径以 JSON 点数组存储） |
| PUT/DELETE | `/api/tasks/:id` | 更新 / 删除任务 |
| POST | `/api/reset` | 清空并恢复演示数据 |

## 目录结构

```
├── server/            # Node 后端
│   ├── index.js       # HTTP 服务 + 静态托管
│   ├── analysis.js    # 冲突检测引擎（五类风险 + 建议生成）
│   ├── db.js          # SQLite 访问层与表结构
│   ├── validate.js    # 入参校验
│   └── seed.js        # 演示数据
├── shared/            # 前后端共享
│   ├── geometry.js    # 扇区 / 路径几何计算
│   ├── time.js        # 时段工具
│   └── constants.js   # 阈值与枚举
├── src/               # React 前端
│   ├── App.jsx
│   └── components/    # 平面图、甘特图、冲突面板、配置表单
├── test/              # Vitest 测试
├── Dockerfile
├── docker-compose.yml
├── start.sh / start.bat
└── package.json
```

## 冲突判定的主要参数（`shared/constants.js`）

- 竖向安全净高 `VERTICAL_CLEARANCE = 3 m`：臂顶 / 吊钩高差小于该值才视为同立面碰撞
- 路径安全包络 `PATH_SAFE_GAP = 6 m`：两路径净距阈值
- 塔身余量 `MAST_GAP = 0.5 m`

参数集中管理，可按项目规范调整后重新运行测试验证。
