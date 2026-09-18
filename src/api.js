// 前端 API 封装
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || ['请求失败']).join('；'));
  return data;
}

export const api = {
  state: () => request('/api/state'),
  analyze: (payload) => request('/api/analyze', { method: 'POST', body: payload }),
  reset: () => request('/api/reset', { method: 'POST' }),
  createCrane: (body) => request('/api/cranes', { method: 'POST', body }),
  updateCrane: (id, body) => request(`/api/cranes/${id}`, { method: 'PUT', body }),
  deleteCrane: (id) => request(`/api/cranes/${id}`, { method: 'DELETE' }),
  createTask: (body) => request('/api/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/api/tasks/${id}`, { method: 'PUT', body }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
};
