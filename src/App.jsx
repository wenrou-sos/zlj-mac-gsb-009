import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import PlanCanvas from './components/PlanCanvas.jsx';
import Timeline from './components/Timeline.jsx';
import ConflictPanel from './components/ConflictPanel.jsx';
import CraneForm from './components/CraneForm.jsx';
import TaskForm from './components/TaskForm.jsx';
import { ACTION_TYPE, CRANE_COLORS } from '../shared/constants.js';
import { toMillis } from '../shared/time.js';

const colorOf = (id) => CRANE_COLORS[(id - 1) % CRANE_COLORS.length];

export default function App() {
  const [cranes, setCranes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('cranes'); // cranes | tasks
  const [editingCrane, setEditingCrane] = useState(null); // null=不显示, false=新增, obj=编辑
  const [editingTask, setEditingTask] = useState(null);
  const [formError, setFormError] = useState('');
  const [pathDraft, setPathDraft] = useState(null);
  const [committedPath, setCommittedPath] = useState(null);
  const [busySug, setBusySug] = useState(null);

  const [selected, setSelected] = useState({ craneId: null, taskId: null, conflictId: null });

  // 推演播放
  const [playhead, setPlayhead] = useState(null);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  const range = useMemo(() => {
    if (tasks.length === 0) return null;
    return {
      start: Math.min(...tasks.map((t) => toMillis(t.start_time))),
      end: Math.max(...tasks.map((t) => toMillis(t.end_time))),
    };
  }, [tasks]);

  const refresh = useCallback(async () => {
    const s = await api.state();
    setCranes(s.cranes);
    setTasks(s.tasks);
    setAnalysis(s.analysis);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  // 播放循环：每 200ms 推进（10 分钟计划时长 / 秒）
  useEffect(() => {
    if (!playing || !range) return;
    timerRef.current = setInterval(() => {
      setPlayhead((p) => {
        const next = (p ?? range.start) + (range.end - range.start) / 60;
        if (next >= range.end) {
          setPlaying(false);
          return range.end;
        }
        return next;
      });
    }, 200);
    return () => clearInterval(timerRef.current);
  }, [playing, range]);

  const handlePlay = () => {
    if (!range) return;
    if (playhead == null || playhead >= range.end) setPlayhead(range.start);
    setPlaying((v) => !v);
  };

  // ---------- 表单提交 ----------
  const submitCrane = async (form) => {
    setFormError('');
    try {
      if (editingCrane && editingCrane !== true) await api.updateCrane(editingCrane.id, form);
      else await api.createCrane(form);
      setEditingCrane(null);
      await refresh();
    } catch (e) {
      setFormError(e.message);
    }
  };

  const submitTask = async (form) => {
    setFormError('');
    try {
      const payload = { ...form, crane_id: Number(form.crane_id) };
      if (editingTask && editingTask !== true) await api.updateTask(editingTask.id, payload);
      else await api.createTask(payload);
      setEditingTask(null);
      setPathDraft(null);
      setCommittedPath(null);
      await refresh();
    } catch (e) {
      setFormError(e.message);
    }
  };

  function openTaskForm(value) {
    setFormError('');
    setPathDraft(null);
    // 编辑时初始沿用任务已有路径；新增时为 null（空路径）
    setCommittedPath(value && value !== true ? value.path : null);
    setEditingTask(value);
  }

  const removeCrane = async (id) => {
    if (!confirm('删除塔吊将同时删除其全部任务，确认？')) return;
    await api.deleteCrane(id);
    await refresh();
  };
  const removeTask = async (id) => {
    await api.deleteTask(id);
    await refresh();
  };

  // ---------- 一键应用调整建议 ----------
  const applySuggestion = async (sug, conflict) => {
    setBusySug(sug.id);
    try {
      const a = sug.action;
      if (a.type === ACTION_TYPE.SHIFT_TASK) {
        const t = tasks.find((x) => x.id === a.taskId);
        await api.updateTask(a.taskId, { ...t, start_time: a.start_time, end_time: a.end_time });
      } else if (a.type === ACTION_TYPE.RAISE_TASK) {
        const t = tasks.find((x) => x.id === a.taskId);
        await api.updateTask(a.taskId, { ...t, hook_height: a.hook_height });
      } else if (a.type === ACTION_TYPE.LIMIT_SWING) {
        const c = cranes.find((x) => x.id === a.craneId);
        await api.updateCrane(a.craneId, { ...c, jib_length: a.jib_length });
      }
      await refresh();
    } catch (e) {
      alert(`应用失败：${e.message}`);
    } finally {
      setBusySug(null);
    }
  };

  const resetDemo = async () => {
    if (!confirm('将清空当前配置并恢复演示数据，确认？')) return;
    await api.reset();
    await refresh();
    setSelected({ craneId: null, taskId: null, conflictId: null });
  };

  // ---------- 路径绘制 ----------
  const onCanvasPoint = (pt) => {
    if (pathDraft) setPathDraft((d) => [...d, pt]);
  };
  const pathAction = (act) => {
    if (act === 'undo') setPathDraft((d) => d.slice(0, -1));
    if (act === 'cancel') setPathDraft(null);
    if (act === 'done' && pathDraft && pathDraft.length >= 2) {
      // 草稿固化：切回查看模式，TaskForm 以 committedPath 作为路径提交
      setCommittedPath(pathDraft);
      setPathDraft(null);
    }
  };

  const craneName = (id) => cranes.find((c) => c.id === id)?.name || `#${id}`;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">🏗</span>
          <div>
            <h1>塔吊作业冲突预演平台</h1>
            <p>配置塔吊布置与吊装计划 · 自动识别空间碰撞与时间冲突 · 生成调整建议</p>
          </div>
        </div>
        <div className="header-tools">
          <button className="btn-ghost" onClick={resetDemo}>恢复演示数据</button>
        </div>
      </header>

      {error && <div className="global-error">{error} <button onClick={refresh}>重试</button></div>}

      <div className="layout">
        {/* 左：配置侧栏 */}
        <aside className="sidebar">
          {editingCrane !== null ? (
            <CraneForm
              crane={editingCrane === true ? null : editingCrane}
              onSubmit={submitCrane}
              onCancel={() => setEditingCrane(null)}
              error={formError}
            />
          ) : editingTask !== null ? (
            <TaskForm
              task={editingTask === true ? null : editingTask}
              cranes={cranes}
              pathDraft={pathDraft}
              committedPath={committedPath}
              onStartPath={() => setPathDraft(committedPath ? [...committedPath] : [])}
              onPathAction={pathAction}
              onSubmit={submitTask}
              onCancel={() => {
                setEditingTask(null);
                setPathDraft(null);
                setCommittedPath(null);
              }}
              error={formError}
            />
          ) : (
            <>
              <div className="tabs">
                <button className={tab === 'cranes' ? 'active' : ''} onClick={() => setTab('cranes')}>
                  塔吊配置 ({cranes.length})
                </button>
                <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
                  作业任务 ({tasks.length})
                </button>
              </div>

              {tab === 'cranes' && (
                <div className="entity-list">
                  {cranes.map((c) => (
                    <div
                      key={c.id}
                      className={`entity-card ${selected.craneId === c.id ? 'sel' : ''}`}
                      onClick={() => setSelected((s) => ({ ...s, craneId: c.id, conflictId: null }))}
                    >
                      <div className="ec-head">
                        <i className="ec-dot" style={{ background: colorOf(c.id) }} />
                        <b>{c.name}</b>
                        <span className="ec-actions">
                          <button onClick={(e) => { e.stopPropagation(); setFormError(''); setEditingCrane(c); }}>编辑</button>
                          <button className="danger" onClick={(e) => { e.stopPropagation(); removeCrane(c.id); }}>删除</button>
                        </span>
                      </div>
                      <div className="ec-meta">
                        坐标 ({c.x}, {c.y}) · 臂长 {c.jib_length}m · 塔高 {c.height}m · 回转 {c.swing_start}°~{c.swing_start + c.swing_sweep}°
                      </div>
                    </div>
                  ))}
                  <button className="btn-add" onClick={() => { setFormError(''); setEditingCrane(true); }}>＋ 新增塔吊</button>
                </div>
              )}

              {tab === 'tasks' && (
                <div className="entity-list">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`entity-card ${selected.taskId === t.id ? 'sel' : ''}`}
                      onClick={() => setSelected((s) => ({ ...s, taskId: t.id, conflictId: null }))}
                    >
                      <div className="ec-head">
                        <i className="ec-dot" style={{ background: colorOf(t.crane_id) }} />
                        <b>{t.name}</b>
                        <span className="ec-actions">
                          <button onClick={(e) => { e.stopPropagation(); openTaskForm(t); }}>编辑</button>
                          <button className="danger" onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}>删除</button>
                        </span>
                      </div>
                      <div className="ec-meta">
                        {craneName(t.crane_id)} · 吊钩 {t.hook_height}m · {t.path.length} 个路径点
                      </div>
                    </div>
                  ))}
                  {cranes.length === 0 && <div className="muted pad">请先添加至少一台塔吊</div>}
                  <button className="btn-add" disabled={cranes.length === 0} onClick={() => openTaskForm(true)}>
                    ＋ 新增吊装任务
                  </button>
                </div>
              )}
            </>
          )}
        </aside>

        {/* 中：画布 + 时间轴 */}
        <main className="main">
          <div className="playback">
            <button className="btn-play" onClick={handlePlay} disabled={!range}>
              {playing ? '⏸ 暂停' : '▶ 推演'}
            </button>
            <button className="btn-ghost" disabled={playhead == null} onClick={() => { setPlaying(false); setPlayhead(null); }}>
              ⏹ 复位
            </button>
            {range && (
              <input
                type="range"
                min={range.start}
                max={range.end}
                value={playhead ?? range.start}
                step={(range.end - range.start) / 300}
                onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }}
              />
            )}
            <span className="playback-time">
              {playhead != null
                ? new Date(playhead).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
                : '拖动或点击推演查看吊钩运动'}
            </span>
          </div>

          {loading ? (
            <div className="loading">加载中…</div>
          ) : (
            <PlanCanvas
              cranes={cranes}
              tasks={tasks}
              analysis={analysis}
              selected={selected}
              onSelectCrane={(id) => setSelected((s) => ({ ...s, craneId: id, conflictId: null }))}
              pathDraft={pathDraft}
              onCanvasPoint={onCanvasPoint}
              playhead={playhead}
            />
          )}

          <Timeline
            cranes={cranes}
            tasks={tasks}
            analysis={analysis}
            playhead={playhead}
            selected={selected}
            onSeek={(ms) => { setPlaying(false); setPlayhead(ms); }}
            onSelectTask={(id) => setSelected((s) => ({ ...s, taskId: id, conflictId: null }))}
          />
        </main>

        {/* 右：冲突面板 */}
        <section className="conflicts">
          <ConflictPanel
            analysis={analysis}
            selected={selected}
            busyId={busySug}
            onSelect={(id) => setSelected((s) => ({ ...s, conflictId: s.conflictId === id ? null : id }))}
            onApply={applySuggestion}
          />
        </section>
      </div>
    </div>
  );
}
