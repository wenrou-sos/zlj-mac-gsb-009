// HTTP 服务：REST API + 生产环境静态托管 dist/
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { existsSync, statSync, readFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as db from './db.js';
import { analyze } from './analysis.js';
import { validateCrane, validateTask } from './validate.js';
import { seedIfEmpty } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });

// 路由表：[method, pattern, handler]
async function apiRouter(req, res, url) {
  const m = req.method;
  const seg = url.pathname.split('/').filter(Boolean); // /api/cranes/3 -> ['api','cranes','3']
  const body = ['POST', 'PUT', 'PATCH'].includes(m) ? await readJson(req) : null;

  // 健康检查
  if (m === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, service: 'tower-crane-conflict-platform', time: new Date().toISOString() });
  }

  // 全量数据 + 冲突分析
  if (m === 'GET' && url.pathname === '/api/state') {
    const cranes = db.listCranes();
    const tasks = db.listTasks();
    return send(res, 200, { cranes, tasks, analysis: analyze(cranes, tasks) });
  }
  if (m === 'POST' && url.pathname === '/api/analyze') {
    const cranes = Array.isArray(body?.cranes) ? body.cranes : db.listCranes();
    const tasks = Array.isArray(body?.tasks) ? body.tasks : db.listTasks();
    return send(res, 200, analyze(cranes, tasks));
  }
  if (m === 'POST' && url.pathname === '/api/reset') {
    db.resetAll();
    seedIfEmpty();
    return send(res, 200, { cranes: db.listCranes(), tasks: db.listTasks() });
  }

  // /api/cranes[/{id}]
  if (seg[0] === 'api' && seg[1] === 'cranes' && seg.length <= 3) {
    if (m === 'GET' && seg.length === 2) return send(res, 200, db.listCranes());
    if (m === 'POST' && seg.length === 2) {
      const { value, errors } = validateCrane(body);
      if (errors.length) return send(res, 400, { errors });
      return send(res, 201, db.createCrane(value));
    }
    if (seg.length === 3) {
      const id = Number(seg[2]);
      if (!Number.isInteger(id)) return send(res, 400, { errors: ['ID 无效'] });
      const existing = db.getDb().prepare('SELECT id FROM cranes WHERE id = ?').get(id);
      if (!existing) return send(res, 404, { errors: ['塔吊不存在'] });
      if (m === 'PUT') {
        const { value, errors } = validateCrane(body);
        if (errors.length) return send(res, 400, { errors });
        return send(res, 200, db.updateCrane(id, value));
      }
      if (m === 'PATCH') {
        const { value, errors } = validateCrane(body, { partial: true });
        if (errors.length) return send(res, 400, { errors });
        const merged = { ...existing, ...value };
        return send(res, 200, db.updateCrane(id, merged));
      }
      if (m === 'DELETE') {
        db.deleteCrane(id);
        return send(res, 200, { ok: true });
      }
    }
  }

  // /api/tasks[/{id}]
  if (seg[0] === 'api' && seg[1] === 'tasks' && seg.length <= 3) {
    if (m === 'GET' && seg.length === 2) return send(res, 200, db.listTasks());
    if (m === 'POST' && seg.length === 2) {
      const { value, errors } = validateTask(body);
      if (errors.length) return send(res, 400, { errors });
      if (!db.getDb().prepare('SELECT id FROM cranes WHERE id = ?').get(value.crane_id)) {
        return send(res, 400, { errors: ['所属塔吊不存在'] });
      }
      return send(res, 201, db.createTask(value));
    }
    if (seg.length === 3) {
      const id = Number(seg[2]);
      if (!Number.isInteger(id)) return send(res, 400, { errors: ['ID 无效'] });
      if (m === 'PUT' || m === 'PATCH') {
        const { value, errors } = validateTask(body, { partial: m === 'PATCH' });
        if (errors.length) return send(res, 400, { errors });
        return send(res, 200, db.updateTask(id, value));
      }
      if (m === 'DELETE') {
        db.deleteTask(id);
        return send(res, 200, { ok: true });
      }
    }
  }

  return send(res, 404, { errors: ['接口不存在'] });
}

// 静态资源（生产模式）
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = normalize(join(DIST_DIR, rel));
  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA 回退
    const index = join(DIST_DIR, 'index.html');
    if (existsSync(index)) return send(res, 200, await readFileAsync(index), { 'Content-Type': MIME['.html'] });
    return send(res, 404, { errors: ['前端未构建，请先运行 npm run build'] });
  }
  send(res, 200, await readFileAsync(filePath), { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
}

const readFileAsync = (p) => new Promise((resolve, reject) => readFile(p, (e, d) => (e ? reject(e) : resolve(d))));

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) return await apiRouter(req, res, url);
      return await serveStatic(req, res, url);
    } catch (err) {
      send(res, 400, { errors: [err.message || '请求处理失败'] });
    }
  });
}

// 直接运行时启动（测试中仅 createServer，不占端口）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  db.openDb();
  seedIfEmpty();
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`\n  塔吊作业冲突预演平台已启动`);
    console.log(`  ➜  本地访问: http://localhost:${PORT}\n`);
  });
}
