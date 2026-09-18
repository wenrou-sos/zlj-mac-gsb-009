import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from '../server/db.js';
import { createServer } from '../server/index.js';
import { seedIfEmpty } from '../server/seed.js';

let server;
let base;

beforeAll(async () => {
  db.openDb(':memory:');
  seedIfEmpty();
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.getDb().close();
});

const json = async (path, options) => {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

describe('HTTP API', () => {
  it('GET /api/health 健康检查', async () => {
    const { status, body } = await json('/api/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('GET /api/state 返回塔吊、任务与分析结果', async () => {
    const { status, body } = await json('/api/state');
    expect(status).toBe(200);
    expect(body.cranes.length).toBeGreaterThanOrEqual(4);
    expect(body.tasks.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(body.analysis.conflicts)).toBe(true);
    expect(body.analysis.summary.total).toBe(body.analysis.conflicts.length);
    // 演示数据包含全部五种冲突类型
    const types = new Set(body.analysis.conflicts.map((c) => c.type));
    expect(types.has('mast-hit')).toBe(true);
    expect(types.has('jib-overlap')).toBe(true);
    expect(types.has('path-cross')).toBe(true);
    expect(types.has('path-jib')).toBe(true);
    expect(types.has('schedule')).toBe(true);
  });

  it('塔吊 CRUD 全流程', async () => {
    const created = await json('/api/cranes', {
      method: 'POST',
      body: { name: '测试塔', x: 500, y: 500, jib_length: 40, height: 55, mast_radius: 1.5, swing_start: 10, swing_sweep: 200 },
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const updated = await json(`/api/cranes/${id}`, {
      method: 'PUT',
      body: { ...created.body, name: '测试塔-改', jib_length: 42 },
    });
    expect(updated.body.name).toBe('测试塔-改');
    expect(updated.body.jib_length).toBe(42);

    const removed = await json(`/api/cranes/${id}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
  });

  it('创建塔吊参数非法时返回 400', async () => {
    const r = await json('/api/cranes', { method: 'POST', body: { name: '', x: -5, y: 0 } });
    expect(r.status).toBe(400);
    expect(r.body.errors.length).toBeGreaterThan(0);
  });

  it('任务 CRUD + 级联删除：删塔吊后任务一并删除', async () => {
    const c = await json('/api/cranes', {
      method: 'POST',
      body: { name: '级联塔', x: 400, y: 400, jib_length: 30, height: 50, mast_radius: 1.5, swing_start: 0, swing_sweep: 360 },
    });
    const t = await json('/api/tasks', {
      method: 'POST',
      body: {
        crane_id: c.body.id,
        name: '级联任务',
        start_time: '2099-01-01T08:00',
        end_time: '2099-01-01T10:00',
        hook_height: 20,
        load_weight: 1,
        path: [
          { x: 400, y: 400 },
          { x: 420, y: 420 },
        ],
        note: '',
      },
    });
    expect(t.status).toBe(201);

    const badTime = await json('/api/tasks', {
      method: 'POST',
      body: {
        crane_id: c.body.id,
        name: '时间倒置',
        start_time: '2099-01-01T10:00',
        end_time: '2099-01-01T08:00',
        hook_height: 20,
        load_weight: 0,
        path: [],
        note: '',
      },
    });
    expect(badTime.status).toBe(400);

    await json(`/api/cranes/${c.body.id}`, { method: 'DELETE' });
    const tasks = await json('/api/tasks');
    expect(tasks.body.find((x) => x.id === t.body.id)).toBeUndefined();
  });

  it('POST /api/analyze 支持前端传来的临时方案（不落库）', async () => {
    const r = await json('/api/analyze', {
      method: 'POST',
      body: {
        cranes: [
          { id: 1, name: 'A', x: 0, y: 0, jib_length: 50, height: 60, mast_radius: 1.6, swing_start: 0, swing_sweep: 360 },
          { id: 2, name: 'B', x: 40, y: 0, jib_length: 50, height: 60, mast_radius: 1.6, swing_start: 0, swing_sweep: 360 },
        ],
        tasks: [],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.summary.high).toBeGreaterThanOrEqual(2);
  });

  it('未知接口返回 404', async () => {
    const r = await json('/api/nope');
    expect(r.status).toBe(404);
  });

  it('前端未构建时根路径给出构建提示而不是崩溃', async () => {
    const res = await fetch(`${base}/`);
    // dist 存在则返回 HTML，否则 404 JSON —— 两种情况服务都应正常响应
    expect([200, 404]).toContain(res.status);
  });
});
