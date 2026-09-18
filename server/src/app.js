import express from 'express';
import cors from 'cors';
import {
  openDb,
  listCranes,
  listTasks,
  insertCrane,
  updateCrane,
  deleteCrane,
  insertTask,
  updateTask,
  deleteTask,
  mapCrane,
  mapTask,
  getCraneRow,
  getTaskRow,
} from './db.js';
import { analyzeSchedule, liveHazards } from './engine.js';
import { seedData } from './seed.js';
import { SITE, toMinute } from './geometry.js';

const craneById = (id) => mapCrane(getCraneRow(id));
const taskById = (id) => mapTask(getTaskRow(id));

export async function createApp(dbPath) {
  const db = await openDb(dbPath);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  function validateCrane(body) {
    const errs = [];
    if (!body.name || !String(body.name).trim()) errs.push('name 不能为空');
    for (const k of ['x', 'y', 'maxRadius', 'jibHeight']) {
      if (typeof body[k] !== 'number' || Number.isNaN(body[k])) errs.push(`${k} 必须是数字`);
    }
    if (body.x < 0 || body.x > SITE.width) errs.push(`x 需在场区 0~${SITE.width} 内`);
    if (body.y < 0 || body.y > SITE.height) errs.push(`y 需在场区 0~${SITE.height} 内`);
    if (body.maxRadius <= 0) errs.push('maxRadius 必须大于 0');
    if ((body.minRadius ?? 0) < 0 || (body.minRadius ?? 0) >= body.maxRadius) errs.push('minRadius 需小于 maxRadius');
    if (body.sweep < 0 || body.sweep > 360) errs.push('sweep 范围为 0~360');
    return errs;
  }

  function validateTask(body) {
    const errs = [];
    if (!body.name || !String(body.name).trim()) errs.push('name 不能为空');
    if (!/^\d{2}:\d{2}$/.test(body.start ?? '') || !/^\d{2}:\d{2}$/.test(body.end ?? '')) errs.push('时间格式应为 HH:MM');
    if (/^\d{2}:\d{2}$/.test(body.start ?? '') && /^\d{2}:\d{2}$/.test(body.end ?? '') && toMinute(body.end) <= toMinute(body.start)) {
      errs.push('end 必须晚于 start');
    }
    if (!Array.isArray(body.path) || body.path.length < 2) errs.push('path 至少包含 2 个路径点');
    else {
      for (const p of body.path) {
        if (typeof p.x !== 'number' || typeof p.y !== 'number') errs.push('路径点必须含数字 x/y');
      }
    }
    return errs;
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, site: SITE }));

  app.get('/api/cranes', (_req, res) => res.json(listCranes()));

  app.post('/api/cranes', (req, res) => {
    const errs = validateCrane(req.body || {});
    if (errs.length) return res.status(400).json({ error: errs.join('；') });
    res.status(201).json(insertCrane(req.body));
  });

  app.put('/api/cranes/:id', (req, res) => {
    if (!craneById(req.params.id)) return res.status(404).json({ error: '塔吊不存在' });
    const errs = validateCrane(req.body || {});
    if (errs.length) return res.status(400).json({ error: errs.join('；') });
    res.json(updateCrane(req.params.id, req.body));
  });

  app.delete('/api/cranes/:id', (req, res) => {
    if (!craneById(req.params.id)) return res.status(404).json({ error: '塔吊不存在' });
    deleteCrane(req.params.id);
    res.status(204).end();
  });

  app.get('/api/tasks', (_req, res) => res.json(listTasks()));

  app.post('/api/tasks', (req, res) => {
    const body = req.body || {};
    const errs = validateTask(body);
    if (!craneById(body.craneId)) errs.push('craneId 指向的塔吊不存在');
    if (errs.length) return res.status(400).json({ error: errs.join('；') });
    res.status(201).json(insertTask(body));
  });

  app.put('/api/tasks/:id', (req, res) => {
    if (!taskById(req.params.id)) return res.status(404).json({ error: '任务不存在' });
    const body = req.body || {};
    const errs = validateTask(body);
    if (!craneById(body.craneId)) errs.push('craneId 指向的塔吊不存在');
    if (errs.length) return res.status(400).json({ error: errs.join('；') });
    res.json(updateTask(req.params.id, body));
  });

  app.delete('/api/tasks/:id', (req, res) => {
    if (!taskById(req.params.id)) return res.status(404).json({ error: '任务不存在' });
    deleteTask(req.params.id);
    res.status(204).end();
  });

  // 对指定（或当前库内全部）方案做冲突分析
  app.post('/api/analyze', (req, res) => {
    const { cranes, tasks } = req.body || {};
    const c = Array.isArray(cranes) && cranes.length ? cranes : listCranes();
    const t = Array.isArray(tasks) ? tasks : listTasks();
    res.json(analyzeSchedule(c, t));
  });

  // 某时刻的实时预演数据
  app.get('/api/simulate', (req, res) => {
    const minute = Number(req.query.minute ?? 0);
    if (Number.isNaN(minute)) return res.status(400).json({ error: 'minute 必须是数字' });
    res.json(liveHazards(listCranes(), listTasks(), Math.max(0, Math.min(1439, minute))));
  });

  app.post('/api/seed', (_req, res) => res.json(seedData(db)));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  });

  return { app, db };
}
