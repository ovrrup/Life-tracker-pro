/* =============================================================================
   app.jsx — Lifetrack Backend Logic
   All state, storage, API calls, and React components live here.
   index.html loads this file via Babel standalone — no build step needed.
   ============================================================================= */

const { useState, useEffect, useCallback, useRef, useMemo } = React;

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LAYER  (localStorage with namespaced keys)
// ─────────────────────────────────────────────────────────────────────────────
const STORE_PREFIX = "lt_v1_";

const DB = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("Storage write failed:", e);
      return false;
    }
  },
  del(key) {
    localStorage.removeItem(STORE_PREFIX + key);
  },
  keys() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(STORE_PREFIX))
      .map(k => k.slice(STORE_PREFIX.length));
  },
  exportAll() {
    const out = {};
    DB.keys().forEach(k => { out[k] = DB.get(k); });
    return out;
  },
  importAll(data) {
    Object.entries(data).forEach(([k, v]) => DB.set(k, v));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2, 9);
const pad  = (n) => String(n).padStart(2, "0");
const TODAY = new Date().toISOString().slice(0, 10);

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => dateStr(6 - i));
}

function last30Days() {
  return Array.from({ length: 30 }, (_, i) => dateStr(29 - i));
}

function fmtDate(isoDate) {
  return new Date(isoDate + "T12:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtDateShort(isoDate) {
  return new Date(isoDate + "T12:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function dayOfWeek(isoDate) {
  // Returns 0 (Sun) – 6 (Sat)
  return new Date(isoDate + "T12:00").getDay();
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_HABITS = [
  { id: uid(), name: "Meditate",    emoji: "🧘", color: "#4ecdc4", days: [0,1,2,3,4,5,6], active: true },
  { id: uid(), name: "Exercise",    emoji: "💪", color: "#c9a94e", days: [0,1,2,3,4,5,6], active: true },
  { id: uid(), name: "Read",        emoji: "📖", color: "#5dbe80", days: [0,1,2,3,4,5,6], active: true },
  { id: uid(), name: "Drink Water", emoji: "💧", color: "#4ecdc4", days: [0,1,2,3,4,5,6], active: true },
  { id: uid(), name: "No screens",  emoji: "🚫", color: "#9b8afb", days: [5,6],            active: true },
];

const DEFAULT_TRACKERS = [
  { id: uid(), name: "Read 20 Books",    current: 4,    goal: 20,   unit: "books", color: "#4ecdc4" },
  { id: uid(), name: "Workout 100 Days", current: 48,   goal: 100,  unit: "days",  color: "#c9a94e" },
  { id: uid(), name: "Save $5,000",      current: 2100, goal: 5000, unit: "$",     color: "#5dbe80" },
];

const DEFAULT_ROUTINE = {
  morning: [
    { id: uid(), name: "Wake & stretch", emoji: "🌅", duration: 5,  notes: "" },
    { id: uid(), name: "Meditation",     emoji: "🧘", duration: 10, notes: "Use Calm or Headspace" },
    { id: uid(), name: "Cold shower",    emoji: "🚿", duration: 5,  notes: "" },
    { id: uid(), name: "Journaling",     emoji: "✍️",  duration: 10, notes: "3 things grateful for" },
  ],
  evening: [
    { id: uid(), name: "Review the day", emoji: "📋", duration: 5,  notes: "" },
    { id: uid(), name: "Read",           emoji: "📖", duration: 20, notes: "Fiction or non-fiction" },
    { id: uid(), name: "No screens",     emoji: "🚫", duration: 30, notes: "30 min before bed" },
  ],
};

const COLORS  = ["#4ecdc4","#c9a94e","#5dbe80","#e06060","#9b8afb","#f0a868","#e887c4","#7ec8e3","#a8e6cf","#ffd93d"];
const DAYS    = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MOODS   = ["😞","😐","🙂","😊","🤩"];
const MOOD_LABELS = ["Rough","Okay","Good","Great","Amazing"];

const PRIORITIES = ["high","med","low"];

// ─────────────────────────────────────────────────────────────────────────────
// SVG ICONS
// ─────────────────────────────────────────────────────────────────────────────
function Ico({ n, s = 15 }) {
  const paths = {
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    check:    <polyline points="20 6 9 17 4 12"/>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>,
    edit:     <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    close:    <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    up:       <polyline points="18 15 12 9 6 15"/>,
    down:     <polyline points="6 9 12 15 18 9"/>,
    home:     <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    repeat:   <><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>,
    check2:   <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>,
    cog:      <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    flag:     <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
    mood:     <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>,
    journal:  <><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></>,
    chart:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    ai:       <><path d="M12 2a4 4 0 014 4v2h1a3 3 0 010 6h-1v2a4 4 0 01-8 0v-2H7a3 3 0 010-6h1V6a4 4 0 014-4z"/></>,
    save:     <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    export:   <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    copy:     <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[n] || null}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC AI  (called from AI Coach page)
// ─────────────────────────────────────────────────────────────────────────────
async function callAI(systemPrompt, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.text })),
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.content?.find(c => c.type === "text")?.text || "No response.";
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  const [page,     setPage]     = useState("dashboard");
  const [modal,    setModal]    = useState(null);   // { type, payload }

  // ── Data state ──────────────────────────────────────────
  const [habits,    setHabits]    = useState(() => DB.get("habits",    DEFAULT_HABITS));
  const [logs,      setLogs]      = useState(() => DB.get("logs",      {}));
  const [tasks,     setTasks]     = useState(() => DB.get("tasks",     []));
  const [trackers,  setTrackers]  = useState(() => DB.get("trackers",  DEFAULT_TRACKERS));
  const [mood,      setMood]      = useState(() => DB.get("mood",      {}));
  const [journals,  setJournals]  = useState(() => DB.get("journals",  []));
  const [routine,   setRoutine]   = useState(() => DB.get("routine",   DEFAULT_ROUTINE));

  // Hide loading screen
  useEffect(() => {
    const el = document.getElementById("loading");
    if (el) el.style.opacity = "0", setTimeout(() => el.remove(), 300);
  }, []);

  // ── Persisted setters ────────────────────────────────────
  const saveHabits   = useCallback(v => { setHabits(v);   DB.set("habits",   v); }, []);
  const saveLogs     = useCallback(v => { setLogs(v);     DB.set("logs",     v); }, []);
  const saveTasks    = useCallback(v => { setTasks(v);    DB.set("tasks",    v); }, []);
  const saveTrackers = useCallback(v => { setTrackers(v); DB.set("trackers", v); }, []);
  const saveMood     = useCallback(v => { setMood(v);     DB.set("mood",     v); }, []);
  const saveJournals = useCallback(v => { setJournals(v); DB.set("journals", v); }, []);
  const saveRoutine  = useCallback(v => { setRoutine(v);  DB.set("routine",  v); }, []);

  // ── Computed daily stats ─────────────────────────────────
  const todayTasks      = tasks.filter(t => t.date === TODAY);
  const todayDone       = todayTasks.filter(t => t.done).length;
  const activeHabits    = habits.filter(h => h.active);
  const todayHabitCount = activeHabits.filter(h => logs[`${TODAY}__${h.id}`]).length;
  const habitPct        = activeHabits.length
    ? Math.round((todayHabitCount / activeHabits.length) * 100) : 0;
  const todayMood       = mood[TODAY] || {};

  // ── Nav items ────────────────────────────────────────────
  const nav = [
    { id:"dashboard", icon:"home",    label:"Dashboard" },
    { id:"habits",    icon:"repeat",  label:"Habits",
      badge: activeHabits.length > 0 ? `${todayHabitCount}/${activeHabits.length}` : null },
    { id:"tasks",     icon:"check2",  label:"Tasks",
      badge: todayTasks.filter(t=>!t.done).length || null },
    { id:"routine",   icon:"cog",     label:"Routine" },
    null,
    { id:"trackers",  icon:"flag",    label:"Goals" },
    { id:"mood",      icon:"mood",    label:"Mood" },
    { id:"journal",   icon:"journal", label:"Journal" },
    null,
    { id:"insights",  icon:"chart",   label:"Analytics" },
    { id:"ai",        icon:"ai",      label:"AI Coach" },
  ];

  const PAGE_TITLES = {
    dashboard:"Dashboard", habits:"Habits", tasks:"Tasks",
    routine:"Routine Builder", trackers:"Goals & Trackers",
    mood:"Mood Tracker", journal:"Journal",
    insights:"Analytics", ai:"AI Coach",
  };

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ─────────────────────────────────────── */}
      <nav className="sidebar">
        <div className="sidebar-head">
          <div className="logotype">Life<em>track</em></div>
          <div className="logotype-sub">Personal OS</div>
        </div>

        {nav.map((item, i) => {
          if (!item) return <div key={i} className="divider" style={{margin:"6px 0"}}/>;
          return (
            <button key={item.id}
              className={`nav-item${page === item.id ? " active" : ""}`}
              onClick={() => setPage(item.id)}>
              <Ico n={item.icon} s={14}/>
              <span>{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          );
        })}

        <div className="sidebar-footer">
          <strong>{TODAY}</strong><br/>All data local
        </div>
      </nav>

      {/* ── MAIN ────────────────────────────────────────── */}
      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <div className="page-title">{PAGE_TITLES[page]}</div>
          </div>
          <div className="topbar-right">
            <div className="date-chip">{fmtDate(TODAY)}</div>
          </div>
        </div>

        <div className="content-area">
          {page === "dashboard" && (
            <DashboardPage
              habits={activeHabits} logs={logs} tasks={todayTasks}
              trackers={trackers} habitPct={habitPct} todayDone={todayDone}
              todayMood={todayMood} routine={routine} TODAY={TODAY}
              saveLogs={saveLogs}
            />
          )}
          {page === "habits"   && <HabitsPage   habits={habits} logs={logs} saveHabits={saveHabits} saveLogs={saveLogs} TODAY={TODAY} setModal={setModal}/>}
          {page === "tasks"    && <TasksPage    tasks={tasks} saveTasks={saveTasks} TODAY={TODAY} setModal={setModal}/>}
          {page === "routine"  && <RoutinePage  routine={routine} saveRoutine={saveRoutine} setModal={setModal}/>}
          {page === "trackers" && <TrackersPage trackers={trackers} saveTrackers={saveTrackers} setModal={setModal}/>}
          {page === "mood"     && <MoodPage     mood={mood} saveMood={saveMood} TODAY={TODAY}/>}
          {page === "journal"  && <JournalPage  journals={journals} saveJournals={saveJournals} TODAY={TODAY}/>}
          {page === "insights" && <InsightsPage habits={activeHabits} logs={logs} tasks={tasks} mood={mood} trackers={trackers}/>}
          {page === "ai"       && (
            <AIPage habits={habits} logs={logs} tasks={tasks}
              trackers={trackers} mood={mood} routine={routine} TODAY={TODAY}/>
          )}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────── */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          {modal.type === "habit"        && <HabitModal     habit={modal.payload}    habits={habits}   saveHabits={saveHabits}   onClose={() => setModal(null)}/>}
          {modal.type === "task"         && <TaskModal      task={modal.payload}     tasks={tasks}     saveTasks={saveTasks}     onClose={() => setModal(null)}/>}
          {modal.type === "tracker"      && <TrackerModal   tracker={modal.payload}  trackers={trackers} saveTrackers={saveTrackers} onClose={() => setModal(null)}/>}
          {modal.type === "routine-item" && <RoutineItemModal item={modal.payload?.item} slot={modal.payload?.slot} routine={routine} saveRoutine={saveRoutine} onClose={() => setModal(null)}/>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function DashboardPage({ habits, logs, tasks, trackers, habitPct, todayDone, todayMood, routine, TODAY, saveLogs }) {
  const hr = new Date().getHours();
  const routineSlot = hr < 12 ? "morning" : hr >= 20 ? "evening" : null;
  const slotItems = routineSlot ? (routine[routineSlot] || []) : [];

  const toggleHabit = (id) => {
    const k = `${TODAY}__${id}`;
    saveLogs({ ...logs, [k]: !logs[k] });
  };

  return (
    <div className="anim-fade-up">
      {/* Stats row */}
      <div className="g4 mb-md">
        <div className="stat-card">
          <div className="stat-n" style={{color:"var(--cyan)"}}>{habitPct}%</div>
          <div className="stat-l">Habits Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-n">{todayDone}/{tasks.length}</div>
          <div className="stat-l">Tasks Done</div>
        </div>
        <div className="stat-card">
          <div className="stat-n" style={{color:"var(--gold)"}}>
            {todayMood.level ? MOODS[todayMood.level - 1] : "—"}
          </div>
          <div className="stat-l">Today's Mood</div>
        </div>
        <div className="stat-card">
          <div className="stat-n" style={{color:"var(--green)"}}>{trackers.length}</div>
          <div className="stat-l">Active Goals</div>
        </div>
      </div>

      <div className="g2 mb-md">
        {/* Today habits */}
        <div className="card">
          <div className="card-head">
            <div className="card-label">Habits — Today</div>
          </div>
          {habits.length === 0 && <div className="empty-state"><div className="es-icon">🔁</div>No habits configured</div>}
          {habits.slice(0, 6).map(h => {
            const done = !!logs[`${TODAY}__${h.id}`];
            return (
              <div key={h.id} className="habit-row">
                <span className="h-emoji">{h.emoji}</span>
                <span className="h-name">{h.name}</span>
                <div className="habit-dot done"
                  style={{ background: done ? h.color : "var(--s3)", borderColor: done ? h.color : "var(--b2)", color: done ? "#040404" : "transparent", cursor:"pointer" }}
                  onClick={() => toggleHabit(h.id)}>
                  {done && <Ico n="check" s={11}/>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today tasks */}
        <div className="card">
          <div className="card-head"><div className="card-label">Tasks — Today</div></div>
          {tasks.length === 0 && <div className="empty-state"><div className="es-icon">✅</div>No tasks for today</div>}
          {tasks.slice(0, 6).map(t => (
            <div key={t.id} className={`task-row${t.done ? " done-t" : ""}`}>
              <div className={`task-check${t.done ? " checked" : ""}`}
                style={{ background: t.done ? "var(--cyan)" : "transparent", borderColor: t.done ? "var(--cyan)" : undefined }}>
                {t.done && <Ico n="check" s={10}/>}
              </div>
              <span className="task-text">{t.text}</span>
              {t.priority && <span className={`priority-badge p-${t.priority}`}>{t.priority}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="g2">
        {/* Routine */}
        <div className="card">
          <div className="card-head">
            <div className="card-label">
              {routineSlot ? `${routineSlot.charAt(0).toUpperCase() + routineSlot.slice(1)} Routine` : "Routine"}
            </div>
            {routineSlot && (
              <span className="text-xs muted">
                {slotItems.reduce((a,b)=>a+(+b.duration||0),0)}m total
              </span>
            )}
          </div>
          {!routineSlot
            ? <div className="empty-state"><div className="es-icon">☀️</div>Check back morning or evening</div>
            : slotItems.length === 0
            ? <div className="empty-state"><div className="es-icon">➕</div>Add items in Routine Builder</div>
            : slotItems.map((item, i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--b1)"}}>
                <span style={{fontSize:"1rem"}}>{item.emoji||"⭕"}</span>
                <span style={{fontSize:"0.84rem",flex:1}}>{item.name}</span>
                <span className="text-xs muted">{item.duration}m</span>
              </div>
            ))
          }
        </div>

        {/* Goal bars */}
        <div className="card">
          <div className="card-head"><div className="card-label">Goal Progress</div></div>
          {trackers.length === 0 && <div className="empty-state"><div className="es-icon">🏁</div>No goals set</div>}
          {trackers.slice(0, 5).map(t => {
            const pct = Math.min(100, Math.round((t.current / t.goal) * 100));
            return (
              <div key={t.id} style={{marginBottom:14}}>
                <div className="row-between" style={{marginBottom:5}}>
                  <span style={{fontSize:"0.84rem"}}>{t.name}</span>
                  <span className="text-xs muted">{pct}%</span>
                </div>
                <div className="bar-track" style={{height:4}}>
                  <div className="bar-fill" style={{width:`${pct}%`, background:t.color}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: HABITS
// ─────────────────────────────────────────────────────────────────────────────
function HabitsPage({ habits, logs, saveHabits, saveLogs, TODAY, setModal }) {
  const days7 = last7Days();

  const toggleLog = (habitId, date) => {
    const k = `${date}__${habitId}`;
    saveLogs({ ...logs, [k]: !logs[k] });
  };

  const deleteHabit = (id) => saveHabits(habits.filter(h => h.id !== id));
  const toggleActive = (id) => saveHabits(habits.map(h => h.id === id ? { ...h, active: !h.active } : h));

  const streakFor = (h) => {
    let s = 0;
    for (let i = 0; i < 60; i++) {
      if (logs[`${dateStr(i)}__${h.id}`]) s++;
      else break;
    }
    return s;
  };

  const active   = habits.filter(h => h.active);
  const inactive = habits.filter(h => !h.active);

  return (
    <div className="anim-fade-up">
      <div className="row-between mb-md">
        <span className="text-sm muted">{active.length} active habits · tap dots to log</span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ type:"habit", payload:null })}>
          <Ico n="plus" s={13}/> New Habit
        </button>
      </div>

      {active.length > 0 && (
        <div className="card mb-md">
          <div className="card-head">
            <div className="card-label">Weekly Overview</div>
            <div style={{display:"flex",gap:6}}>
              {days7.map(d => (
                <div key={d} className="day-col-head"
                  style={{color: d === TODAY ? "var(--cyan)" : undefined}}>
                  {new Date(d + "T12:00").toLocaleDateString("en-US",{weekday:"short"}).slice(0,2)}
                </div>
              ))}
              <div style={{width:66}}/>
            </div>
          </div>
          {active.map(h => {
            const streak = streakFor(h);
            return (
              <div key={h.id} className="habit-row">
                <span className="h-emoji">{h.emoji}</span>
                <span className="h-name" style={{minWidth:110}}>{h.name}</span>
                {streak > 0 && <span className="h-streak">🔥 {streak}</span>}
                <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                  {days7.map(d => {
                    const done = !!logs[`${d}__${h.id}`];
                    return (
                      <div key={d} className="habit-dot"
                        style={{
                          background: done ? h.color : "var(--s3)",
                          borderColor: done ? h.color : d === TODAY ? "var(--b3)" : "var(--b1)",
                          color: done ? "#040404" : "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => toggleLog(h.id, d)}>
                        {done && <Ico n="check" s={11}/>}
                      </div>
                    );
                  })}
                </div>
                <div className="habit-actions" style={{marginLeft:8}}>
                  <button className="btn btn-ghost btn-icon" onClick={() => setModal({ type:"habit", payload:h })}><Ico n="edit" s={13}/></button>
                  <button className="btn btn-ghost btn-icon" onClick={() => toggleActive(h.id)} title="Pause"><Ico n="copy" s={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => deleteHabit(h.id)}><Ico n="trash" s={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-label">Paused</div></div>
          {inactive.map(h => (
            <div key={h.id} className="habit-row" style={{opacity:0.45}}>
              <span className="h-emoji">{h.emoji}</span>
              <span className="h-name">{h.name}</span>
              <button className="btn btn-sm" style={{marginLeft:"auto"}} onClick={() => toggleActive(h.id)}>Resume</button>
              <button className="btn btn-danger btn-icon" onClick={() => deleteHabit(h.id)}><Ico n="trash" s={13}/></button>
            </div>
          ))}
        </div>
      )}

      {habits.length === 0 && (
        <div className="empty-state" style={{marginTop:60}}>
          <div className="es-icon">🔁</div>
          No habits yet — create your first one above
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: TASKS
// ─────────────────────────────────────────────────────────────────────────────
function TasksPage({ tasks, saveTasks, TODAY, setModal }) {
  const [newText,   setNewText]   = useState("");
  const [newPri,    setNewPri]    = useState("med");
  const [filter,    setFilter]    = useState("today");

  const filtered = useMemo(() => {
    let base = [...tasks];
    if (filter === "today")   base = base.filter(t => t.date === TODAY);
    if (filter === "pending") base = base.filter(t => !t.done);
    if (filter === "done")    base = base.filter(t => t.done);
    const order = { high: 0, med: 1, low: 2 };
    return base.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  }, [tasks, filter, TODAY]);

  const addTask = () => {
    if (!newText.trim()) return;
    saveTasks([...tasks, { id: uid(), text: newText.trim(), done: false, date: TODAY, priority: newPri, created: Date.now() }]);
    setNewText("");
  };

  const toggleDone = (id) => saveTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const delTask    = (id) => saveTasks(tasks.filter(t => t.id !== id));

  const counts = {
    today:   tasks.filter(t => t.date === TODAY).length,
    pending: tasks.filter(t => !t.done).length,
    done:    tasks.filter(t => t.done).length,
    all:     tasks.length,
  };

  return (
    <div className="anim-fade-up">
      {/* Quick add */}
      <div className="card mb-md">
        <div style={{display:"flex",gap:10}}>
          <input className="input flex1" placeholder="Add a task and press Enter…"
            value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTask()}/>
          <select className="select" style={{width:100}} value={newPri} onChange={e => setNewPri(e.target.value)}>
            <option value="high">⬆ High</option>
            <option value="med">➡ Med</option>
            <option value="low">⬇ Low</option>
          </select>
          <button className="btn btn-primary" onClick={addTask}><Ico n="plus" s={14}/> Add</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tabs">
        {["today","pending","done","all"].map(f => (
          <button key={f} className={`tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{marginLeft:5,fontSize:"0.62rem",opacity:0.6}}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card">
        {filtered.length === 0 && (
          <div className="empty-state"><div className="es-icon">✅</div>Nothing here</div>
        )}
        {filtered.map(t => (
          <div key={t.id} className={`task-row${t.done ? " done-t" : ""}`}>
            <div className={`task-check${t.done ? " checked" : ""}`}
              style={{ background: t.done ? "var(--cyan)" : undefined, borderColor: t.done ? "var(--cyan)" : undefined }}
              onClick={() => toggleDone(t.id)}>
              {t.done && <Ico n="check" s={10}/>}
            </div>
            <span className="task-text">{t.text}</span>
            {t.priority && <span className={`priority-badge p-${t.priority}`}>{t.priority}</span>}
            {t.date !== TODAY && <span className="tag">{t.date}</span>}
            <div className="task-actions">
              <button className="btn btn-ghost btn-icon" onClick={() => setModal({ type:"task", payload:t })}><Ico n="edit" s={13}/></button>
              <button className="btn btn-danger btn-icon" onClick={() => delTask(t.id)}><Ico n="trash" s={13}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: ROUTINE
// ─────────────────────────────────────────────────────────────────────────────
function RoutinePage({ routine, saveRoutine, setModal }) {
  const del   = (slot, id)      => saveRoutine({ ...routine, [slot]: routine[slot].filter(i => i.id !== id) });
  const move  = (slot, id, dir) => {
    const arr = [...routine[slot]];
    const i   = arr.findIndex(x => x.id === id);
    if (i < 0 || i + dir < 0 || i + dir >= arr.length) return;
    [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
    saveRoutine({ ...routine, [slot]: arr });
  };
  const total = (slot) => (routine[slot] || []).reduce((a, b) => a + (+b.duration || 0), 0);

  return (
    <div className="anim-fade-up">
      <p className="text-sm muted mb-md">Build your morning and evening routines. Reorder with arrows, set durations, add personal notes.</p>
      <div className="g2">
        {["morning", "evening"].map(slot => (
          <div key={slot} className="card">
            <div className="card-head">
              <div className="row" style={{gap:8}}>
                <span style={{fontSize:"1.1rem"}}>{slot === "morning" ? "🌅" : "🌙"}</span>
                <div className="card-label">{slot.charAt(0).toUpperCase() + slot.slice(1)}</div>
                <span className="badge-cyan">{total(slot)}m</span>
              </div>
              <button className="btn btn-primary btn-sm"
                onClick={() => setModal({ type:"routine-item", payload:{ item:null, slot }})}>
                <Ico n="plus" s={12}/>
              </button>
            </div>

            {(!routine[slot] || routine[slot].length === 0) && (
              <div className="empty-state"><div className="es-icon">{slot === "morning" ? "☀️" : "🌙"}</div>No items yet</div>
            )}

            {(routine[slot] || []).map((item) => (
              <div key={item.id} className="routine-item">
                {/* reorder */}
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  <button className="btn btn-ghost btn-icon" style={{padding:"2px 3px"}} onClick={() => move(slot, item.id, -1)}><Ico n="up" s={10}/></button>
                  <button className="btn btn-ghost btn-icon" style={{padding:"2px 3px"}} onClick={() => move(slot, item.id, +1)}><Ico n="down" s={10}/></button>
                </div>
                <span style={{fontSize:"1rem"}}>{item.emoji || "⭕"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:"0.85rem",fontWeight:400}}>{item.name}</div>
                  {item.notes && <div className="text-xs muted" style={{marginTop:2}}>{item.notes}</div>}
                </div>
                <span className="badge-gold">{item.duration}m</span>
                <div className="routine-actions">
                  <button className="btn btn-ghost btn-icon"
                    onClick={() => setModal({ type:"routine-item", payload:{ item, slot }})}><Ico n="edit" s={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => del(slot, item.id)}><Ico n="trash" s={13}/></button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: TRACKERS / GOALS
// ─────────────────────────────────────────────────────────────────────────────
function TrackersPage({ trackers, saveTrackers, setModal }) {
  const del = (id) => saveTrackers(trackers.filter(t => t.id !== id));

  const updateCurrent = (id, raw) => {
    const n = parseFloat(raw);
    if (isNaN(n)) return;
    saveTrackers(trackers.map(t => t.id === id ? { ...t, current: Math.min(t.goal, Math.max(0, n)) } : t));
  };

  return (
    <div className="anim-fade-up">
      <div className="row-between mb-md">
        <span className="text-sm muted">{trackers.length} goals tracked</span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ type:"tracker", payload:null })}>
          <Ico n="plus" s={13}/> New Goal
        </button>
      </div>

      <div className="g2">
        {trackers.map(t => {
          const pct = Math.min(100, Math.round((t.current / t.goal) * 100));
          return (
            <div key={t.id} className="tracker-card">
              <div className="card-head">
                <span style={{fontSize:"0.9rem",fontWeight:500}}>{t.name}</span>
                <div className="card-actions">
                  <button className="btn btn-ghost btn-icon" onClick={() => setModal({ type:"tracker", payload:t })}><Ico n="edit" s={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => del(t.id)}><Ico n="trash" s={13}/></button>
                </div>
              </div>

              <div className="row" style={{alignItems:"baseline",gap:8,marginBottom:14}}>
                <span className="tracker-num" style={{color:t.color}}>{t.current.toLocaleString()}</span>
                <span className="tracker-denom">/ {t.goal.toLocaleString()} {t.unit}</span>
              </div>

              <div className="bar-track" style={{height:5,marginBottom:14}}>
                <div className="bar-fill" style={{width:`${pct}%`, background:t.color}}/>
              </div>

              <div className="row">
                <input type="number" className="input flex1" style={{padding:"6px 10px"}}
                  placeholder="Update value…"
                  onBlur={e  => { if (e.target.value) { updateCurrent(t.id, e.target.value); e.target.value = ""; }}}
                  onKeyDown={e => { if (e.key === "Enter" && e.target.value) { updateCurrent(t.id, e.target.value); e.target.value = ""; e.target.blur(); }}}
                />
                <span className="text-xs muted">{pct}% done</span>
              </div>
            </div>
          );
        })}

        {trackers.length === 0 && (
          <div className="card span2">
            <div className="empty-state"><div className="es-icon">🏁</div>No goals yet — create your first!</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: MOOD
// ─────────────────────────────────────────────────────────────────────────────
function MoodPage({ mood, saveMood, TODAY }) {
  const todayEntry = mood[TODAY] || {};

  const setLevel = (l) => saveMood({ ...mood, [TODAY]: { ...todayEntry, level: l } });
  const setNote  = (n) => saveMood({ ...mood, [TODAY]: { ...todayEntry, note: n } });

  const days14 = Array.from({ length: 14 }, (_, i) => dateStr(13 - i));
  const moodColors = ["", "#e06060","#c9a94e","#9a9a9a","#5dbe80","#4ecdc4"];

  const withMood = Object.entries(mood).filter(([, v]) => v.level).sort(([a], [b]) => b.localeCompare(a));
  const avgMood  = withMood.length
    ? (withMood.reduce((a, [, v]) => a + v.level, 0) / withMood.length).toFixed(1)
    : "—";

  return (
    <div className="anim-fade-up">
      <div className="g2 mb-md">
        {/* Log today */}
        <div className="card">
          <div className="card-head"><div className="card-label">How are you feeling today?</div></div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {MOODS.map((m, i) => (
              <button key={i} className={`mood-btn${todayEntry.level === i + 1 ? " active" : ""}`}
                title={MOOD_LABELS[i]} onClick={() => setLevel(i + 1)}>{m}</button>
            ))}
          </div>
          <textarea className="textarea"
            placeholder={`Any thoughts for today? Wins, struggles, gratitude…`}
            defaultValue={todayEntry.note || ""}
            onBlur={e => setNote(e.target.value)}
            style={{minHeight:90}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:10,alignItems:"center"}}>
            {todayEntry.level
              ? <span className="badge-cyan">{MOODS[todayEntry.level-1]} {MOOD_LABELS[todayEntry.level-1]}</span>
              : <span className="text-xs muted">Not logged yet</span>}
            <span className="text-xs muted">Auto-saved</span>
          </div>
        </div>

        {/* 14-day grid */}
        <div className="card">
          <div className="card-head">
            <div className="card-label">14-Day Mood</div>
            <span className="badge-gold">avg {avgMood}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:7,marginBottom:14}}>
            {days14.map(d => {
              const entry = mood[d];
              return (
                <div key={d} title={`${d}: ${entry?.level ? MOOD_LABELS[entry.level-1] : "—"}`}
                  style={{
                    aspectRatio:"1", borderRadius:10,
                    background: entry?.level ? moodColors[entry.level] : "var(--s3)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:"0.9rem", opacity: d === TODAY ? 1 : 0.75,
                  }}>
                  {entry?.level ? MOODS[entry.level - 1] : ""}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {MOODS.map((m, i) => (
              <span key={i} className="text-xs muted">{m} {MOOD_LABELS[i]}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Log history with notes */}
      <div className="card">
        <div className="card-head"><div className="card-label">Journal Notes</div></div>
        {withMood.filter(([,v])=>v.note).slice(0,10).map(([d, v]) => (
          <div key={d} style={{padding:"12px 0",borderBottom:"1px solid var(--b1)"}}>
            <div className="row" style={{marginBottom:5}}>
              <span style={{fontSize:"1rem"}}>{MOODS[v.level-1]}</span>
              <span className="journal-meta" style={{margin:0}}>{fmtDate(d)}</span>
            </div>
            <p style={{fontSize:"0.84rem",color:"var(--t2)",lineHeight:1.65}}>{v.note}</p>
          </div>
        ))}
        {withMood.filter(([,v])=>v.note).length === 0 && (
          <div className="empty-state"><div className="es-icon">📓</div>No notes yet — add thoughts when logging mood</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: JOURNAL
// ─────────────────────────────────────────────────────────────────────────────
function JournalPage({ journals, saveJournals, TODAY }) {
  const [title,   setTitle]   = useState("");
  const [body,    setBody]    = useState("");
  const [saving,  setSaving]  = useState(false);
  const [editing, setEditing] = useState(null); // id of entry being edited

  const save = () => {
    if (!body.trim()) return;
    setSaving(true);
    if (editing) {
      saveJournals(journals.map(j => j.id === editing ? { ...j, title: title || "Untitled", text: body } : j));
      setEditing(null);
    } else {
      saveJournals([{ id: uid(), date: TODAY, title: title || "Untitled", text: body, created: Date.now() }, ...journals]);
    }
    setTitle(""); setBody("");
    setTimeout(() => setSaving(false), 1200);
  };

  const del   = (id) => saveJournals(journals.filter(j => j.id !== id));
  const edit  = (j)  => { setEditing(j.id); setTitle(j.title); setBody(j.text); window.scrollTo(0,0); };

  return (
    <div className="anim-fade-up">
      <div className="card mb-md">
        <div className="card-head">
          <div className="card-label">{editing ? "Editing Entry" : "New Entry"}</div>
          {editing && (
            <button className="btn btn-sm" onClick={() => { setEditing(null); setTitle(""); setBody(""); }}>
              Cancel
            </button>
          )}
        </div>
        <input className="input" placeholder="Title…" value={title}
          onChange={e => setTitle(e.target.value)} style={{marginBottom:10}}/>
        <textarea className="textarea" placeholder="Write freely — no rules here. Stream of consciousness, reflections, plans…"
          value={body} onChange={e => setBody(e.target.value)} style={{minHeight:150}}/>
        <div className="row-between" style={{marginTop:12}}>
          <span className="text-xs muted">{body.length} chars · {body.trim().split(/\s+/).filter(Boolean).length} words</span>
          <button className={`btn${saving ? " btn-primary" : ""}`} onClick={save}>
            <Ico n="save" s={14}/> {saving ? "Saved ✓" : editing ? "Update Entry" : "Save Entry"}
          </button>
        </div>
      </div>

      {journals.length === 0 && (
        <div className="empty-state" style={{marginTop:40}}>
          <div className="es-icon">📔</div>
          Your journal is empty — write your first entry above
        </div>
      )}

      {journals.map(j => (
        <div key={j.id} className="journal-entry">
          <div className="row-between" style={{marginBottom:8}}>
            <div>
              <div className="journal-title">{j.title}</div>
              <div className="journal-meta">{fmtDate(j.date)}</div>
            </div>
            <div className="row" style={{gap:4}}>
              <button className="btn btn-ghost btn-icon" onClick={() => edit(j)}><Ico n="edit" s={13}/></button>
              <button className="btn btn-danger btn-icon" onClick={() => del(j.id)}><Ico n="trash" s={13}/></button>
            </div>
          </div>
          <p className="journal-body">{j.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────
function InsightsPage({ habits, logs, tasks, mood, trackers }) {
  const days30 = last30Days();

  const dailyHabitPct = days30.map(d => {
    if (habits.length === 0) return 0;
    return Math.round((habits.filter(h => logs[`${d}__${h.id}`]).length / habits.length) * 100);
  });

  const avgHabit = Math.round(dailyHabitPct.reduce((a, b) => a + b, 0) / 30);
  const maxPct   = Math.max(...dailyHabitPct, 1);

  const moodEntries = Object.entries(mood).filter(([, v]) => v.level);
  const avgMood = moodEntries.length
    ? (moodEntries.reduce((a, [, v]) => a + v.level, 0) / moodEntries.length).toFixed(1)
    : "—";

  let bestStreak = 0, cur = 0;
  dailyHabitPct.forEach(p => { if (p >= 80) { cur++; bestStreak = Math.max(bestStreak, cur); } else cur = 0; });

  const totalDone = tasks.filter(t => t.done).length;

  // Heatmap: last 84 days (12 weeks)
  const days84 = Array.from({ length: 84 }, (_, i) => dateStr(83 - i));

  return (
    <div className="anim-fade-up">
      <div className="g4 mb-md">
        <div className="stat-card"><div className="stat-n" style={{color:"var(--cyan)"}}>{avgHabit}%</div><div className="stat-l">30d Habit Avg</div></div>
        <div className="stat-card"><div className="stat-n" style={{color:"var(--gold)"}}>{avgMood}</div><div className="stat-l">Avg Mood</div></div>
        <div className="stat-card"><div className="stat-n">{bestStreak}</div><div className="stat-l">Best Streak</div></div>
        <div className="stat-card"><div className="stat-n" style={{color:"var(--green)"}}>{totalDone}</div><div className="stat-l">Tasks Completed</div></div>
      </div>

      {/* 30-day bar chart */}
      <div className="card mb-md">
        <div className="card-head"><div className="card-label">30-Day Habit Completion</div></div>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:90,marginBottom:6}}>
          {dailyHabitPct.map((p, i) => (
            <div key={i} title={`${days30[i]}: ${p}%`}
              style={{
                flex:1, borderRadius:3,
                background: p > 0 ? "var(--cyan)" : "var(--s3)",
                height: `${Math.max(4, (p / maxPct) * 100)}%`,
                opacity: p > 0 ? 0.35 + 0.65 * (p / 100) : 1,
                transition:"height 0.6s",
              }}/>
          ))}
        </div>
        <div className="row-between text-xs muted">
          <span>30 days ago</span><span>Today</span>
        </div>
      </div>

      {/* Habit heatmap */}
      <div className="card mb-md">
        <div className="card-head"><div className="card-label">12-Week Heatmap</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(12,1fr)",gap:4}}>
          {Array.from({length:12},(_,w)=>days84.slice(w*7,(w+1)*7)).map((week,wi)=>(
            <div key={wi} style={{display:"flex",flexDirection:"column",gap:3}}>
              {week.map(d=>{
                const p = habits.length ? Math.round((habits.filter(h=>logs[`${d}__${h.id}`]).length/habits.length)*100) : 0;
                const cls = p===0?"":p<30?"h1":p<60?"h2":p<90?"h3":"h4";
                return <div key={d} className={`heat-cell ${cls}`} title={`${d}: ${p}%`}/>;
              })}
            </div>
          ))}
        </div>
        <div className="row" style={{gap:8,marginTop:10}}>
          {["None","<30%","<60%","<90%","100%"].map((l,i)=>(
            <div key={i} className="row" style={{gap:4}}>
              <div style={{width:10,height:10,borderRadius:2,background:["var(--s3)","rgba(78,205,196,0.15)","rgba(78,205,196,0.38)","rgba(78,205,196,0.65)","var(--cyan)"][i]}}/>
              <span className="text-xs muted">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Goal progress */}
      <div className="card">
        <div className="card-head"><div className="card-label">Goal Progress</div></div>
        {trackers.map(t => {
          const pct = Math.min(100, Math.round((t.current / t.goal) * 100));
          return (
            <div key={t.id} style={{marginBottom:18}}>
              <div className="row-between" style={{marginBottom:6}}>
                <span style={{fontSize:"0.85rem"}}>{t.name}</span>
                <span className="text-xs muted">{t.current.toLocaleString()} / {t.goal.toLocaleString()} {t.unit} ({pct}%)</span>
              </div>
              <div className="bar-track" style={{height:6}}>
                <div className="bar-fill" style={{width:`${pct}%`, background:t.color}}/>
              </div>
            </div>
          );
        })}
        {trackers.length === 0 && <div className="empty-state"><div className="es-icon">🏁</div>No goals to display</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: AI COACH
// ─────────────────────────────────────────────────────────────────────────────
function AIPage({ habits, logs, tasks, trackers, mood, routine, TODAY }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef();

  const SYSTEM = `You are an AI life coach embedded in a personal life-tracking app. 
You have full access to the user's data. Be concise, warm, and specific — max 150 words per reply.

USER DATA:
- Habits (${habits.length}): ${habits.map(h=>`${h.emoji} ${h.name}`).join(", ") || "none"}
- Today's habit completion: ${habits.length ? Math.round((habits.filter(h=>logs[`${TODAY}__${h.id}`]).length/habits.length)*100)+"%" : "n/a"}
- Goals: ${trackers.map(t=>`${t.name} (${Math.round((t.current/t.goal)*100)}% done)`).join(", ") || "none"}
- Today's mood: ${mood[TODAY]?.level ? ["Rough","Okay","Good","Great","Amazing"][mood[TODAY].level-1] : "not logged"}
- Today's tasks: ${tasks.filter(t=>t.date===TODAY).length} total, ${tasks.filter(t=>t.date===TODAY&&t.done).length} done
- Morning routine: ${routine.morning?.length || 0} items (${routine.morning?.reduce((a,b)=>a+(+b.duration||0),0)||0}m)
- Evening routine: ${routine.evening?.length || 0} items (${routine.evening?.reduce((a,b)=>a+(+b.duration||0),0)||0}m)`;

  const starters = [
    "How am I tracking overall?",
    "What habit should I prioritize?",
    "Analyse my mood patterns",
    "Suggest improvements to my routine",
    "Am I on track with my goals?",
    "What should I focus on today?",
  ];

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const updated = [...messages, { role:"user", text: msg }];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const reply = await callAI(SYSTEM, updated);
      setMessages([...updated, { role:"assistant", text: reply }]);
    } catch (e) {
      setMessages([...updated, { role:"assistant", text: `Error: ${e.message}. Please try again.` }]);
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:"smooth" }), 80);
  };

  return (
    <div className="anim-fade-up">
      <p className="text-sm muted mb-md">Your AI coach knows your habits, goals, mood, and routine in real time.</p>

      {/* Starter prompts */}
      {messages.length === 0 && (
        <div className="card mb-md">
          <div className="card-head"><div className="card-label">Quick Start</div></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {starters.map(s => (
              <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="card mb-md" style={{minHeight:300}}>
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="es-icon">🤖</div>
            Ask your coach anything — no judgment, just insight.
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {messages.map((m, i) => (
            <div key={i} style={{display:"flex",justifyContent: m.role==="user" ? "flex-end" : "flex-start"}}>
              <div className={`chat-bubble ${m.role === "user" ? "chat-user" : "chat-ai"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{display:"flex"}}>
              <div className="chat-bubble chat-ai">
                <div className="ai-typing"><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/></div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>
      </div>

      {/* Input */}
      <div className="row">
        <input className="input flex1" placeholder="Ask your coach…"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          disabled={loading}/>
        <button className="btn btn-primary" onClick={() => send()} disabled={loading || !input.trim()}>
          <Ico n="ai" s={14}/> Ask
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: HABIT
// ─────────────────────────────────────────────────────────────────────────────
function HabitModal({ habit, habits, saveHabits, onClose }) {
  const [form, setForm] = useState(
    habit
      ? { ...habit }
      : { name:"", emoji:"⭕", color: COLORS[0], days:[0,1,2,3,4,5,6], active:true }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = (d) => set("days", form.days.includes(d) ? form.days.filter(x=>x!==d) : [...form.days, d]);

  const save = () => {
    if (!form.name.trim()) return;
    if (habit) {
      saveHabits(habits.map(h => h.id === habit.id ? { ...h, ...form } : h));
    } else {
      saveHabits([...habits, { ...form, id: uid(), active: true }]);
    }
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-title">
        {habit ? "Edit Habit" : "New Habit"}
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Ico n="close" s={16}/></button>
      </div>

      <div className="form-field">
        <label className="form-label">Name</label>
        <input className="input" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Meditate, Exercise…"/>
      </div>

      <div className="form-row-2">
        <div className="form-field">
          <label className="form-label">Emoji</label>
          <input className="input" value={form.emoji} onChange={e=>set("emoji",e.target.value)} maxLength={2}/>
        </div>
        <div className="form-field">
          <label className="form-label">Status</label>
          <select className="select" value={form.active?"active":"paused"} onChange={e=>set("active",e.target.value==="active")}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Color</label>
        <div className="swatch-row">
          {COLORS.map(c => (
            <div key={c} className={`swatch${form.color===c?" selected":""}`}
              style={{background:c}} onClick={()=>set("color",c)}/>
          ))}
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Active Days</label>
        <div style={{display:"flex",gap:6}}>
          {DAYS.map((d, i) => (
            <button key={i} className={`day-sel-btn${form.days?.includes(i)?" on":""}`}
              onClick={()=>toggleDay(i)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Habit</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: TASK
// ─────────────────────────────────────────────────────────────────────────────
function TaskModal({ task, tasks, saveTasks, onClose }) {
  const [form, setForm] = useState(
    task ? { ...task } : { text:"", priority:"med", notes:"", date: TODAY }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.text.trim()) return;
    if (task) {
      saveTasks(tasks.map(t => t.id === task.id ? { ...t, ...form } : t));
    } else {
      saveTasks([...tasks, { ...form, id: uid(), done: false, created: Date.now() }]);
    }
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-title">
        {task ? "Edit Task" : "New Task"}
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Ico n="close" s={16}/></button>
      </div>

      <div className="form-field">
        <label className="form-label">Task</label>
        <input className="input" value={form.text} onChange={e=>set("text",e.target.value)} placeholder="What needs to get done?"/>
      </div>

      <div className="form-row-2">
        <div className="form-field">
          <label className="form-label">Priority</label>
          <div style={{display:"flex",gap:6}}>
            {PRIORITIES.map(p => (
              <button key={p} className={`btn btn-sm${form.priority===p?" btn-primary":""}`}
                onClick={()=>set("priority",p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label className="form-label">Date</label>
          <input type="date" className="input" value={form.date} onChange={e=>set("date",e.target.value)}/>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Notes</label>
        <textarea className="textarea" value={form.notes||""} onChange={e=>set("notes",e.target.value)}
          placeholder="Optional details…" style={{minHeight:60}}/>
      </div>

      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Task</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: TRACKER
// ─────────────────────────────────────────────────────────────────────────────
function TrackerModal({ tracker, trackers, saveTrackers, onClose }) {
  const [form, setForm] = useState(
    tracker ? { ...tracker } : { name:"", current:0, goal:100, unit:"", color: COLORS[0] }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim()) return;
    if (tracker) {
      saveTrackers(trackers.map(t => t.id === tracker.id ? { ...t, ...form } : t));
    } else {
      saveTrackers([...trackers, { ...form, id: uid() }]);
    }
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-title">
        {tracker ? "Edit Goal" : "New Goal"}
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Ico n="close" s={16}/></button>
      </div>

      <div className="form-field">
        <label className="form-label">Goal Name</label>
        <input className="input" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Read 20 Books…"/>
      </div>

      <div className="form-row-3">
        <div className="form-field">
          <label className="form-label">Current</label>
          <input type="number" className="input" value={form.current} onChange={e=>set("current",+e.target.value)}/>
        </div>
        <div className="form-field">
          <label className="form-label">Goal</label>
          <input type="number" className="input" value={form.goal} onChange={e=>set("goal",+e.target.value)}/>
        </div>
        <div className="form-field">
          <label className="form-label">Unit</label>
          <input className="input" value={form.unit} onChange={e=>set("unit",e.target.value)} placeholder="books, $…"/>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Color</label>
        <div className="swatch-row">
          {COLORS.map(c => (
            <div key={c} className={`swatch${form.color===c?" selected":""}`}
              style={{background:c}} onClick={()=>set("color",c)}/>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Goal</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: ROUTINE ITEM
// ─────────────────────────────────────────────────────────────────────────────
function RoutineItemModal({ item, slot, routine, saveRoutine, onClose }) {
  const [form, setForm] = useState(
    item ? { ...item } : { name:"", emoji:"⭕", duration:10, notes:"" }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim()) return;
    const arr = routine[slot] || [];
    if (item) {
      saveRoutine({ ...routine, [slot]: arr.map(x => x.id === item.id ? { ...x, ...form } : x) });
    } else {
      saveRoutine({ ...routine, [slot]: [...arr, { ...form, id: uid() }] });
    }
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-title">
        {item ? "Edit Item" : `Add to ${slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : ""} Routine`}
        <button className="btn btn-ghost btn-icon" onClick={onClose}><Ico n="close" s={16}/></button>
      </div>

      <div className="form-field">
        <label className="form-label">Activity</label>
        <input className="input" value={form.name} onChange={e=>set("name",e.target.value)}
          placeholder="e.g. Meditation, Cold shower…"/>
      </div>

      <div className="form-row-2">
        <div className="form-field">
          <label className="form-label">Emoji</label>
          <input className="input" value={form.emoji} onChange={e=>set("emoji",e.target.value)} maxLength={2}/>
        </div>
        <div className="form-field">
          <label className="form-label">Duration (minutes)</label>
          <input type="number" className="input" value={form.duration}
            onChange={e=>set("duration",+e.target.value)} min={1} max={180}/>
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">Notes / Reminder</label>
        <textarea className="textarea" value={form.notes||""} onChange={e=>set("notes",e.target.value)}
          placeholder="Optional tip or reminder…" style={{minHeight:60}}/>
      </div>

      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Item</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOUNT
// ─────────────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
