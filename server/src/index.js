import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { listCranes, saveNow } from './db.js';
import { seedData } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

const { app, db } = await createApp();

// 首次启动且库为空时自动写入演示数据
if (listCranes().length === 0) {
  seedData(db);
  console.log('✔ 已写入演示数据（3 台塔吊 / 4 个吊装任务）');
}

// 生产环境托管前端构建产物
const distDir = path.resolve(__dirname, '../../client/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const server = app.listen(PORT, () => {
  console.log(`✔ 塔吊作业冲突预演平台后端已启动: http://localhost:${PORT}`);
});

// 退出前确保数据落盘
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    saveNow();
    server.close(() => process.exit(0));
  });
}
