import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const dir = mkdtempSync(join(tmpdir(), 'crane-smoke-'));
const DB = join(dir, 'smoke.db');
const PORT = 3399;
const base = `http://127.0.0.1:${PORT}`;

let proc;
let logs = '';

async function waitReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // 服务尚未就绪
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`服务器在 ${timeoutMs}ms 内未启动。日志:\n${logs}`);
}

describe('服务启动冒烟测试', () => {
  before(async () => {
    proc = spawn(process.execPath, ['src/index.js'], {
      cwd: join(ROOT, 'server'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: DB },
    });
    proc.stdout.on('data', (d) => (logs += d.toString()));
    proc.stderr.on('data', (d) => (logs += d.toString()));
    await waitReady();
  });

  after(() => {
    proc.kill('SIGTERM');
  });

  test('健康检查返回场区信息', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
  });

  test('首次启动自动写入演示数据（3 塔吊 / 4 任务）', async () => {
    const cranes = await (await fetch(`${base}/api/cranes`)).json();
    const tasks = await (await fetch(`${base}/api/tasks`)).json();
    assert.equal(cranes.length, 3);
    assert.equal(tasks.length, 4);
  });

  test('分析接口返回冲突报告', async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const json = await res.json();
    assert.ok(json.summary.total >= 3);
    assert.ok(json.conflicts.every((c) => Array.isArray(c.suggestions) && c.suggestions.length > 0));
  });

  test('构建存在时前端页面由同一服务托管', async () => {
    const indexHtml = join(ROOT, 'client/dist/index.html');
    if (!existsSync(indexHtml)) {
      console.log('  ↳ 跳过：client/dist 尚未构建（运行 npm run build 后生效）');
      return;
    }
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<div id="root">'));
  });
});
