import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api.js';
import SiteMap from './components/SiteMap.jsx';
import ConflictPanel from './components/ConflictPanel.jsx';
import Timeline from './components/Timeline.jsx';
import { CraneForm, TaskForm } from './components/Forms.jsx';

const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function App() {
  const [cranes, setCranes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [report, setReport] = useState({ conflicts: [], summary: { total: 0, high: 0, medium: 0, low: 0 } });
  const [sim, setSim] = useState(null);
  const [minute, setMinute] = useState(8 * 60);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState('cranes'); // cranes | tasks | conflicts
  const [showCraneForm, setShowCraneForm] = useState(false);
  const [editingCrane, setEditingCrane] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTaskForm, setEditingTaskForm] = useState(null);
  // 地图路径编辑会话：null = 未在编辑；否则为正在编辑的路径点数组
  const [pathSession, setPathSession] = useState(null);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [toast, setToast] = useState('');
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    const [cs, ts] = await Promise.all([api.listCranes(), api.listTasks()]);
    setCranes(cs);
    setTasks(ts);
    const r = await api.analyze({ cranes: cs, tasks: ts });
    setReport(r);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // 预演播放
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(async () => {
      setMinute((m) => {
        const next = m >= 18 * 60 - 1 ? 6 * 60 : m + 1;
        return next;
      });
    }, 250);
    return () => clearInterval(timer.current);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    api.simulate(minute).then(setSim);
  }, [minute, playing]);

  // 非播放时拖动时间轴也显示该时刻快照（静态冲突徽标仍保留）
  useEffect(() => {
    if (playing) return;
    let alive = true;
    api.simulate(minute).then((s) => { if (alive) setSim(s); });
    return () => { alive = false; };
  }, [minute, playing, cranes, tasks]);

  async function analyzeLive() {
    const r = await api.analyze({ cranes, tasks });
    setReport(r);
    return r;
  }

  async function saveCrane(form) {
    if (editingCrane) await api.updateCrane(editingCrane.id, form);
    else await api.createCrane(form);
    setShowCraneForm(false);
    setEditingCrane(null);
    await refresh();
    showToast('塔吊已保存');
  }

  async function saveTask(form) {
    if (editingTaskForm) await api.updateTask(editingTaskForm.id, form);
    else await api.createTask(form);
    setShowTaskForm(false);
    setEditingTaskForm(null);
    setPathSession(null);
    await refresh();
    showToast('任务已保存');
  }

  async function removeCrane(c) {
    if (!confirm(`删除「${c.name}」及其全部任务？`)) return;
    await api.deleteCrane(c.id);
    await refresh();
  }

  async function removeTask(t) {
    if (!confirm(`删除任务「${t.name}」？`)) return;
    await api.deleteTask(t.id);
    await refresh();
  }

  async function resetSeed() {
    if (!confirm('恢复演示数据将清空当前全部配置，确定？')) return;
    await api.seed();
    await refresh();
    showToast('已恢复演示数据');
  }

  // 应用调整建议
  async function applySuggestion(s, cf) {
    try {
      if (s.action === 'reschedule') {
        const t = tasks.find((x) => x.id === cf.taskIds[cf.taskIds.length - 1]);
        // 对 schedule_overlap 用后一个任务；load 类冲突建议默认移动 T(后者)，与引擎 delaySuggestion(tb) 一致
        const target = t || tasks.find((x) => cf.taskIds.includes(x.id));
        await api.updateTask(target.id, { ...target, start: s.newStart, end: s.newEnd });
        showToast(`已将「${target.name}」调整为 ${s.newStart}-${s.newEnd}`);
      } else if (s.action === 'raise_jib') {
        const c = cranes.find((x) => x.id === s.craneId);
        await api.updateCrane(c.id, { ...c, jibHeight: s.jibHeight });
        showToast(`已抬升「${c.name}」臂架至 ${s.jibHeight}m`);
      } else if (s.action === 'raise_load') {
        const t = tasks.find((x) => x.id === s.taskId);
        await api.updateTask(t.id, { ...t, liftHeight: s.liftHeight });
        showToast(`已将「${t.name}」起升高度提高至 ${s.liftHeight}m`);
      } else if (s.action === 'reroute' || s.action === 'limit_slew' || s.action === 'manual') {
        showToast('该建议需人工调整路径或限位角度，已在配置面板中打开对应项');
        if (s.action === 'reroute') {
          const t = tasks.find((x) => x.id === cf.taskIds[0]);
          if (t) {
            setEditingTaskForm(t);
            setPathSession(null);
            setShowTaskForm(true);
            setTab('tasks');
          }
        }
        await refresh();
        return;
      }
      await refresh();
    } catch (err) {
      showToast('应用失败：' + err.message);
    }
  }

  // 地图路径编辑：进入/退出会话
  function togglePathEdit(form) {
    if (pathSession) setPathSession(null);
    else setPathSession(form.path.map((p) => ({ ...p })));
  }

  function handleMapClick(p) {
    if (!pathSession) return;
    // 在终点前插入途经点（保留红色终点）
    setPathSession((d) => [...d.slice(0, -1), p, d[d.length - 1]]);
  }

  function handleDragPoint(idx, p) {
    if (!pathSession) return;
    setPathSession((d) => d.map((pt, i) => (i === idx ? p : pt)));
  }

  function handleMapDoubleClick() {
    // 双击地图删除最后一个途经点
    if (pathSession && pathSession.length > 2) {
      setPathSession((d) => d.slice(0, -2).concat(d[d.length - 1]));
    }
  }

  const editingTask = showTaskForm && pathSession
    ? { id: editingTaskForm?.id ?? 'new', path: pathSession }
    : null;

  const mapConflicts = playing ? [] : report.conflicts;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏗️ 塔吊作业冲突预演平台</div>
        <div className="top-actions">
          <button className="btn-ghost" onClick={resetSeed}>恢复演示数据</button>
        </div>
      </header>

      <div className="layout">
        <main className="stage">
          <div className="map-wrap">
            <SiteMap
              cranes={cranes}
              tasks={tasks}
              conflicts={mapConflicts}
              sim={sim}
              minute={minute}
              playing={playing}
              editingTask={editingTask}
              activeTaskIds={selectedConflict ? [...new Set([...(selectedConflict.taskIds || [])])] : sim?.activeTaskIds}
              onMapClick={handleMapClick}
              onMapDoubleClick={handleMapDoubleClick}
              onDragPoint={handleDragPoint}
            />
          </div>

          <div className="sim-bar">
            <button className="btn-play" onClick={() => { setPlaying((p) => !p); if (!playing) setSim(null); }}>
              {playing ? '⏸ 暂停' : '▶ 播放预演'}
            </button>
            <input
              type="range"
              min={6 * 60}
              max={18 * 60 - 1}
              value={minute}
              onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }}
              className="time-slider"
            />
            <span className="time-label">{toHHMM(minute)}</span>
            {sim && !playing && (
              <button className="btn-ghost" onClick={() => api.simulate(minute).then(setSim)}>查看此刻状态</button>
            )}
            {sim?.hazards.length > 0 && <span className="hazard-flag">⚠ 此刻 {sim.hazards.length} 处危险</span>}
          </div>

          <Timeline
            cranes={cranes}
            tasks={tasks}
            minute={minute}
            activeTaskIds={sim?.activeTaskIds}
            onSeek={(m) => { setPlaying(false); setMinute(m); }}
          />
        </main>

        <aside className="sidebar">
          <div className="tabs">
            <button className={tab === 'cranes' ? 'tab active' : 'tab'} onClick={() => setTab('cranes')}>塔吊配置</button>
            <button className={tab === 'tasks' ? 'tab active' : 'tab'} onClick={() => setTab('tasks')}>作业任务</button>
            <button className={tab === 'conflicts' ? 'tab active' : 'tab'} onClick={() => setTab('conflicts')}>
              冲突分析{report.summary.high > 0 && <span className="tab-badge">{report.summary.high}</span>}
            </button>
          </div>

          <div className="tab-body">
            {tab === 'cranes' && (
              <div>
                <button className="btn-primary btn-block" onClick={() => { setEditingCrane(null); setShowCraneForm((v) => !v); }}>
                  {showCraneForm && !editingCrane ? '收起表单' : '+ 新增塔吊'}
                </button>
                {showCraneForm && (
                  <CraneForm
                    initial={editingCrane}
                    onSubmit={saveCrane}
                    onCancel={() => { setShowCraneForm(false); setEditingCrane(null); }}
                  />
                )}
                <div className="item-list">
                  {cranes.map((c) => (
                    <div className="item-card" key={c.id}>
                      <div className="item-main">
                        <span className="item-dot" style={{ background: c.color }} />
                        <div>
                          <div className="item-name">{c.name}</div>
                          <div className="item-meta">
                            ({c.x}, {c.y}) · 幅度 {c.minRadius}~{c.maxRadius}m · 臂高 {c.jibHeight}m
                            {c.sweep < 360 && ` · 扫幅 ${c.sweep}°@${c.bearing}°`}
                          </div>
                        </div>
                      </div>
                      <div className="item-ops">
                        <button className="btn-mini" onClick={() => { setEditingCrane(c); setShowCraneForm(true); }}>编辑</button>
                        <button className="btn-mini btn-danger" onClick={() => removeCrane(c)}>删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'tasks' && (
              <div>
                <button className="btn-primary btn-block" onClick={() => { setEditingTaskForm(null); setPathSession(null); setShowTaskForm((v) => !v); }}>
                  {showTaskForm && !editingTaskForm ? '收起表单' : '+ 新增吊装任务'}
                </button>
                {showTaskForm && (
                  <TaskForm
                    cranes={cranes}
                    initial={editingTaskForm}
                    pathDraft={pathSession}
                    onTogglePathEdit={togglePathEdit}
                    onSubmit={saveTask}
                    onCancel={() => { setShowTaskForm(false); setEditingTaskForm(null); setPathSession(null); }}
                  />
                )}
                <div className="item-list">
                  {tasks.map((t) => {
                    const c = cranes.find((x) => x.id === t.craneId);
                    return (
                      <div className="item-card" key={t.id}>
                        <div className="item-main">
                          <span className="item-dot" style={{ background: c?.color }} />
                          <div>
                            <div className="item-name">{t.name}</div>
                            <div className="item-meta">
                              {c?.name} · {t.start}-{t.end} · 升高 {t.liftHeight}m · 路径 {t.path.length} 点
                            </div>
                          </div>
                        </div>
                        <div className="item-ops">
                          <button className="btn-mini" onClick={() => { setEditingTaskForm(t); setPathSession(null); setShowTaskForm(true); }}>编辑</button>
                          <button className="btn-mini btn-danger" onClick={() => removeTask(t)}>删除</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'conflicts' && (
              <ConflictPanel
                conflicts={report.conflicts}
                summary={report.summary}
                onApply={applySuggestion}
                onLocate={(cf) => { setSelectedConflict(cf); setPlaying(false); }}
              />
            )}
          </div>
        </aside>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
