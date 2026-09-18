const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

export const api = {
  health: () => request('/health'),
  listCranes: () => request('/cranes'),
  createCrane: (body) => request('/cranes', { method: 'POST', body: JSON.stringify(body) }),
  updateCrane: (id, body) => request(`/cranes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCrane: (id) => request(`/cranes/${id}`, { method: 'DELETE' }),
  listTasks: () => request('/tasks'),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  analyze: (body = {}) => request('/analyze', { method: 'POST', body: JSON.stringify(body) }),
  simulate: (minute) => request(`/simulate?minute=${minute}`),
  seed: () => request('/seed', { method: 'POST' }),
};
