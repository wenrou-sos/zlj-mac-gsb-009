import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { closeDb } from '../src/db.js';
import { seedData } from '../src/seed.js';

const dir = mkdtempSync(join(tmpdir(), 'crane-db-'));
const { app, db } = await createApp(join(dir, 'test.db'));

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  closeDb();
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json();
  return { status: res.status, json };
}

describe('API 集成', () => {
  test('健康检查', async () => {
    const { status, json } = await call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.site.width, 120);
  });

  test('写入演示数据后可查询 3 台塔吊与 4 个任务', async () => {
    const { status } = await call('POST', '/api/seed');
    assert.equal(status, 200);
    const cranes = (await call('GET', '/api/cranes')).json;
    const tasks = (await call('GET', '/api/tasks')).json;
    assert.equal(cranes.length, 3);
    assert.equal(tasks.length, 4);
    assert.ok(Array.isArray(tasks[0].path));
  });

  test('演示方案分析出三类冲突', async () => {
    const { json } = await call('POST', '/api/analyze', {});
    const types = new Set(json.conflicts.map((c) => c.type));
    assert.ok(types.has('jib_overlap'));
    assert.ok(types.has('schedule_overlap'));
    assert.ok(types.has('load_load'));
    assert.equal(json.summary.total, json.conflicts.length);
    assert.ok(json.summary.high >= 3);
  });

  test('实时预演 09:28 在 (52,52) 附近有吊重危险点', async () => {
    const { json } = await call('GET', '/api/simulate?minute=568');
    assert.equal(json.activeTaskIds.length, 2); // T1/T3 此刻在作业（T2 已于 09:20 结束）
    assert.ok(json.hazards.some((h) => h.type === 'load_load' && Math.abs(h.x - 52) < 1 && Math.abs(h.y - 52) < 1));
  });

  test('应用改期建议后冲突消除', async () => {
    const tasks = (await call('GET', '/api/tasks')).json;
    const t3 = tasks.find((t) => t.name.startsWith('T3'));
    const updated = await call('PUT', `/api/tasks/${t3.id}`, { ...t3, start: '10:30', end: '11:10' });
    assert.equal(updated.status, 200);
    const { json } = await call('POST', '/api/analyze', {});
    assert.ok(!json.conflicts.some((c) => c.type === 'load_load'));
    assert.ok(!json.conflicts.some((c) => c.type === 'schedule_overlap'));
  });

  test('塔吊 CRUD 与级联删除任务', async () => {
    const created = await call('POST', '/api/cranes', {
      name: '临时塔吊', x: 10, y: 10, maxRadius: 20, minRadius: 4, bearing: 0, sweep: 360, jibHeight: 25,
    });
    assert.equal(created.status, 201);
    const id = created.json.id;

    const bad = await call('POST', '/api/cranes', { name: '', x: 999, y: 0, maxRadius: 0, jibHeight: 10 });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error.includes('name'));

    const task = await call('POST', '/api/tasks', {
      craneId: id, name: '临时任务', start: '07:00', end: '07:30', liftHeight: 15, jibStart: 0, jibEnd: 90,
      path: [{ x: 12, y: 10 }, { x: 20, y: 10 }],
    });
    assert.equal(task.status, 201);

    const badTask = await call('POST', '/api/tasks', {
      craneId: 9999, name: '坏任务', start: '08:00', end: '07:00', liftHeight: 10, path: [{ x: 1, y: 1 }],
    });
    assert.equal(badTask.status, 400);

    await call('DELETE', `/api/cranes/${id}`);
    const left = (await call('GET', '/api/tasks')).json;
    assert.ok(!left.some((t) => t.craneId === id), '删除塔吊应级联删除任务');
  });
});
