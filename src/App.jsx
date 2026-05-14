import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Camera,
  Check,
  ChevronRight,
  Hash,
  Home,
  Images,
  Minus,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import bambooUrl from '../Bamboo.glb?url';

const todayKey = new Date().toISOString().slice(0, 10);
const tabs = [
  { id: 'habits', label: 'Habits', icon: Home },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
const typeLabels = {
  clock: 'Habit',
  number: 'Number',
  photo: 'Comparator',
};
const themeOptions = [
  {
    id: 'forest',
    label: 'Bamboo',
    description: 'Moss glass',
    swatch: '#8fa882',
  },
  {
    id: 'ink',
    label: 'Graphite',
    description: 'Blue steel',
    swatch: '#91a7bd',
  },
  {
    id: 'plum',
    label: 'Sakura',
    description: 'Soft plum',
    swatch: '#b58fa5',
  },
  {
    id: 'tide',
    label: 'Tide',
    description: 'Deep cyan',
    swatch: '#79b5b0',
  },
];

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [activeTab, setActiveTab] = useState('habits');
  const [habits, setHabits] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [numberHabit, setNumberHabit] = useState(null);
  const [addHabitOpen, setAddHabitOpen] = useState(false);
  const [deleteHabit, setDeleteHabit] = useState(null);
  const [deletingHabit, setDeletingHabit] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'forest';
    return window.localStorage.getItem('nenko-theme') ?? 'forest';
  });

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setSplashLeaving(true), 2200);
    const doneTimer = window.setTimeout(() => setShowSplash(false), 3000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  useEffect(() => {
    refreshState();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('nenko-theme', theme);
  }, [theme]);

  async function refreshState() {
    setLoading(true);
    setError('');
    try {
      const state = await api('/api/state');
      setHabits(state.habits);
      setEntries(state.entries);
    } catch {
      setError('Database connection unavailable.');
    } finally {
      setLoading(false);
    }
  }

  const entriesByHabit = useMemo(() => groupEntries(entries), [entries]);
  const completedCount = useMemo(() => {
    return habits.filter((habit) => isEntryComplete(getTodayEntry(entriesByHabit, habit.id), habit.type)).length;
  }, [entriesByHabit, habits]);
  const progressLog = useMemo(() => buildProgressLog(entries, habits), [entries, habits]);

  async function createHabit(payload) {
    const { habit } = await api('/api/habits', {
      method: 'POST',
      body: payload,
    });
    setHabits((current) => [...current, habit]);
  }

  async function archiveHabit(habitId) {
    await api(`/api/habits/${habitId}`, {
      method: 'PATCH',
      body: { archived: true },
    });
    setHabits((current) => current.filter((habit) => habit.id !== habitId));
    setEntries((current) => current.filter((entry) => entry.habitId !== habitId));
  }

  async function toggleClock(habit) {
    const current = getTodayEntry(entriesByHabit, habit.id);
    if (current?.completed) {
      await deleteEntry(habit.id, todayKey);
      return;
    }
    await saveEntry(habit.id, { completed: true });
  }

  async function saveNumber(habit, value) {
    await saveEntry(habit.id, { value });
    setNumberHabit(null);
  }

  async function addPhoto(habit, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photoData = await fileToCompressedDataUrl(file);
      await saveEntry(habit.id, { completed: true, photoData });
    } finally {
      event.target.value = '';
    }
  }

  async function saveEntry(habitId, payload) {
    const { entry } = await api(`/api/entries/${habitId}/${todayKey}`, {
      method: 'PUT',
      body: payload,
    });
    setEntries((current) => upsertEntry(current, entry));
  }

  async function deleteEntry(habitId, date) {
    await api(`/api/entries/${habitId}/${date}`, { method: 'DELETE' });
    setEntries((current) => current.filter((entry) => !(entry.habitId === habitId && entry.date === date)));
  }

  async function resetToday() {
    await Promise.all(habits.map((habit) => api(`/api/entries/${habit.id}/${todayKey}`, { method: 'DELETE' })));
    setEntries((current) => current.filter((entry) => entry.date !== todayKey));
  }

  async function clearPhotos() {
    await api('/api/photos', { method: 'DELETE' });
    const photoIds = new Set(habits.filter((habit) => habit.type === 'photo').map((habit) => habit.id));
    setEntries((current) => current.filter((entry) => !photoIds.has(entry.habitId)));
  }

  async function confirmDeleteHabit() {
    if (!deleteHabit) return;
    setDeletingHabit(true);
    try {
      await archiveHabit(deleteHabit.id);
      setDeleteHabit(null);
    } finally {
      setDeletingHabit(false);
    }
  }

  return (
    <main className="app-root">
      <HabitApp
        activeTab={activeTab}
        completedCount={completedCount}
        entriesByHabit={entriesByHabit}
        error={error}
        habits={habits}
        loading={loading}
        onAddHabit={() => setAddHabitOpen(true)}
        onClearTodayEntry={(habit) => deleteEntry(habit.id, todayKey)}
        onClockTodayEntry={(habit) => saveEntry(habit.id, { completed: true })}
        onClearPhotos={clearPhotos}
        onDeleteHabitRequest={setDeleteHabit}
        onNumberHabit={setNumberHabit}
        onPhotoChange={addPhoto}
        onRefresh={refreshState}
        onResetToday={resetToday}
        onTabChange={setActiveTab}
        onThemeChange={setTheme}
        onToggleClock={toggleClock}
        progressLog={progressLog}
        theme={theme}
      />

      {showSplash && <SplashScreen isLeaving={splashLeaving} />}

      {numberHabit && (
        <NumberHabitModal
          habit={numberHabit}
          initialValue={getTodayEntry(entriesByHabit, numberHabit.id)?.value}
          onClose={() => setNumberHabit(null)}
          onSave={(value) => saveNumber(numberHabit, value)}
        />
      )}

      {addHabitOpen && <AddHabitModal onClose={() => setAddHabitOpen(false)} onSave={createHabit} />}

      {deleteHabit && (
        <ConfirmDeleteModal
          habit={deleteHabit}
          isDeleting={deletingHabit}
          onCancel={() => setDeleteHabit(null)}
          onConfirm={confirmDeleteHabit}
        />
      )}
    </main>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep generic message.
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function SplashScreen({ isLeaving }) {
  return (
    <section className={`splash-screen ${isLeaving ? 'is-leaving' : ''}`} aria-label="Loading Nenko">
      <div className="splash-bg" />
      <h1 className="splash-title">Nenko</h1>
      <BambooScene variant="splash" />
    </section>
  );
}

function HabitApp({
  activeTab,
  completedCount,
  entriesByHabit,
  error,
  habits,
  loading,
  onAddHabit,
  onClearTodayEntry,
  onClockTodayEntry,
  onClearPhotos,
  onDeleteHabitRequest,
  onNumberHabit,
  onPhotoChange,
  onRefresh,
  onResetToday,
  onTabChange,
  onThemeChange,
  onToggleClock,
  progressLog,
  theme,
}) {
  return (
    <section className="habit-app" aria-label="Nenko habit tracker">
      <header className="app-header">
        <div>
          <p className="eyebrow">Today</p>
          <h1>Nenko</h1>
        </div>
        <div className="daily-score" aria-label={`${completedCount} habits complete`}>
          <strong>{completedCount}</strong>
          <span>/ {Math.max(habits.length, 1)}</span>
        </div>
      </header>

      {error && (
        <div className="status-card" role="alert">
          <span>{error}</span>
          <button className="plain-button" type="button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {!error && loading && <div className="status-card">Loading from database...</div>}

      {!error && !loading && activeTab === 'habits' && (
        <HabitsTab
          entriesByHabit={entriesByHabit}
          habits={habits}
          onAddHabit={onAddHabit}
          onClearTodayEntry={onClearTodayEntry}
          onClockTodayEntry={onClockTodayEntry}
          onDeleteHabitRequest={onDeleteHabitRequest}
          onNumberHabit={onNumberHabit}
          onPhotoChange={onPhotoChange}
          onToggleClock={onToggleClock}
        />
      )}

      {!error && !loading && activeTab === 'progress' && (
        <ProgressTab entriesByHabit={entriesByHabit} habits={habits} progressLog={progressLog} />
      )}

      {!error && !loading && activeTab === 'gallery' && <GalleryTab entriesByHabit={entriesByHabit} habits={habits} />}

      {!error && !loading && activeTab === 'settings' && (
        <SettingsTab
          onClearPhotos={onClearPhotos}
          onResetToday={onResetToday}
          onThemeChange={onThemeChange}
          photoCount={countPhotoEntries(entriesByHabit, habits)}
          theme={theme}
        />
      )}

      <TabNav activeTab={activeTab} onTabChange={onTabChange} />
    </section>
  );
}

function HabitsTab({
  entriesByHabit,
  habits,
  onAddHabit,
  onClearTodayEntry,
  onClockTodayEntry,
  onDeleteHabitRequest,
  onNumberHabit,
  onPhotoChange,
  onToggleClock,
}) {
  return (
    <div className="habits-tab tab-panel">
      <div className="habits-toolbar">
        <button className="add-habit-button" type="button" onClick={onAddHabit} aria-label="Add habit" title="Add habit">
          <Plus size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="habit-grid">
        {habits.map((habit) => (
          <HabitTile
            entries={entriesByHabit.get(habit.id) ?? []}
            habit={habit}
            key={habit.id}
            onClearTodayEntry={onClearTodayEntry}
            onClockTodayEntry={onClockTodayEntry}
            onDeleteHabitRequest={onDeleteHabitRequest}
            onNumberHabit={onNumberHabit}
            onPhotoChange={onPhotoChange}
            onToggleClock={onToggleClock}
          />
        ))}
      </div>
    </div>
  );
}

function HabitTile({
  entries,
  habit,
  onClearTodayEntry,
  onClockTodayEntry,
  onDeleteHabitRequest,
  onNumberHabit,
  onPhotoChange,
  onToggleClock,
}) {
  const todayEntry = entries.find((entry) => entry.date === todayKey);

  if (habit.type === 'photo') {
    return (
      <PhotoComparator
        entries={entries}
        habit={habit}
        onClearTodayEntry={onClearTodayEntry}
        onClockTodayEntry={onClockTodayEntry}
        onDeleteHabitRequest={onDeleteHabitRequest}
        onPhotoChange={onPhotoChange}
      />
    );
  }

  const isClock = habit.type === 'clock';
  const complete = isEntryComplete(todayEntry, habit.type);
  const runPrimaryAction = () => {
    if (isClock) {
      onToggleClock(habit);
      return;
    }
    onNumberHabit(habit);
  };
  const meta = isClock
    ? complete
      ? 'Completed today'
      : 'Waiting for check-in'
    : todayEntry?.value == null
      ? todayEntry?.completed
        ? 'Clocked today'
        : habit.target
          ? `Target ${habit.target}`
          : 'No value yet'
      : `${todayEntry.value} logged today`;
  const rightSwipeAction = isClock
    ? {
        actionIcon: Check,
        actionLabel: complete ? 'Unclock' : 'Clock',
        actionVariant: complete ? 'unclock' : 'clock',
        onSwipeRight: () => onToggleClock(habit),
      }
    : {
        actionIcon: complete ? Minus : Check,
        actionLabel: complete ? 'Unclock' : 'Clock',
        actionVariant: complete ? 'unclock' : 'clock',
        onSwipeRight: () => {
          if (complete) {
            onClearTodayEntry(habit);
            return;
          }
          onClockTodayEntry(habit);
        },
      };

  return (
    <SwipeHabitCard
      habit={habit}
      onDeleteRequest={onDeleteHabitRequest}
      {...rightSwipeAction}
    >
      <article
        className={[
          'habit-card action-card animated-card',
          complete ? 'is-complete-card' : '',
          isClock && complete ? 'is-clocked-card' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={runPrimaryAction}
        onKeyDown={(event) => activateOnKeyboard(event, runPrimaryAction)}
        role="button"
        tabIndex={0}
      >
        <div className="card-topline">
          <span className="type-icon">{isClock ? <Check size={18} strokeWidth={1.8} /> : <Hash size={18} strokeWidth={1.8} />}</span>
          <span>{typeLabels[habit.type]}</span>
        </div>
        <div>
          <h2>{habit.name}</h2>
          <p>{meta}</p>
        </div>
        {isClock ? (
          <span className={complete ? 'plain-button is-complete' : 'plain-button'}>
            {complete ? 'Clocked in' : 'Clock in'}
            <Check size={17} strokeWidth={1.8} />
          </span>
        ) : (
          <span className="plain-button">
            {todayEntry?.value == null ? 'Enter number' : 'Update'}
            <Hash size={17} strokeWidth={1.8} />
          </span>
        )}
      </article>
    </SwipeHabitCard>
  );
}

function SwipeHabitCard({
  actionIcon: ActionIcon = Trash2,
  actionLabel = 'Delete',
  actionVariant = 'delete',
  children,
  habit,
  onDeleteRequest,
  onSwipeRight,
}) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const openRef = useRef(false);
  const hasRightAction = Boolean(onSwipeRight);
  const dragRef = useRef({
    didDrag: false,
    pointerId: null,
    startOffset: 0,
    startX: 0,
  });
  const isOpen = offset < -1;

  function updateOffset(nextOffset) {
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function setOpen(nextOpen) {
    openRef.current = nextOpen;
    updateOffset(nextOpen ? -86 : 0);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
    dragRef.current = {
      didDrag: false,
      pointerId: event.pointerId,
      startOffset: openRef.current ? -86 : 0,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) < 6 && !drag.didDrag) return;

    drag.didDrag = true;
    updateOffset(Math.max(-86, Math.min(hasRightAction ? 86 : 0, drag.startOffset + deltaX)));
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const shouldOpenDelete = offsetRef.current < -42;
    const shouldRunRightAction = hasRightAction && offsetRef.current > 42;

    if (shouldRunRightAction) {
      onSwipeRight();
      setOpen(false);
    } else if (shouldOpenDelete) {
      setOpen(true);
    } else {
      setOpen(false);
    }
    window.setTimeout(() => {
      drag.didDrag = false;
    }, 180);
    drag.pointerId = null;
  }

  function handleClickCapture(event) {
    if (!dragRef.current.didDrag && !openRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    if (!dragRef.current.didDrag && openRef.current) {
      setOpen(false);
    }
    dragRef.current.didDrag = false;
  }

  return (
    <div className={isOpen ? 'swipe-card is-open' : 'swipe-card'}>
      {hasRightAction && (
        <button
          className={`swipe-clock-action swipe-action-${actionVariant}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
            onSwipeRight();
          }}
          aria-label={`${actionLabel} ${habit.name}`}
        >
          <ActionIcon size={17} strokeWidth={1.8} />
          <span>{actionLabel}</span>
        </button>
      )}
      <button
        className="swipe-delete swipe-action-delete"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(false);
          onDeleteRequest(habit);
        }}
        aria-label={`Delete ${habit.name}`}
      >
        <Trash2 size={17} strokeWidth={1.8} />
        <span>Delete</span>
      </button>
      <div
        className="swipe-card-surface"
        style={{ transform: `translateX(${offset}px)` }}
        onClickCapture={handleClickCapture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}
      </div>
    </div>
  );
}

function ProgressTab({ entriesByHabit, habits, progressLog }) {
  const days = useMemo(() => buildProgressDays(progressLog), [progressLog]);
  const numberStats = useMemo(() => buildNumberStats(habits, entriesByHabit), [entriesByHabit, habits]);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter((day) => day.count > 0).length;
  const best = days.reduce((max, day) => Math.max(max, day.count), 0);

  return (
    <div className="progress-tab tab-panel">
      <section className="progress-summary">
        <div>
          <p className="eyebrow">Progress</p>
          <h2>Last 16 weeks</h2>
        </div>
        <div className="summary-grid">
          <Metric label="Checks" value={total} />
          <Metric label="Active days" value={activeDays} />
          <Metric label="Best day" value={best} />
        </div>
      </section>

      <section className="heatmap-panel" aria-label="Habit completion heatmap">
        <div className="heatmap-scroll">
          <div className="heatmap-grid">
            {days.map((day) => (
              <span
                className={`heat-cell level-${Math.min(day.count, 4)}`}
                key={day.date}
                title={`${day.label}: ${day.count} checks`}
                aria-label={`${day.label}: ${day.count} checks`}
              />
            ))}
          </div>
        </div>
        <div className="heatmap-footer">
          <span>Less</span>
          <span className="heat-cell level-0" />
          <span className="heat-cell level-1" />
          <span className="heat-cell level-2" />
          <span className="heat-cell level-3" />
          <span className="heat-cell level-4" />
          <span>More</span>
        </div>
      </section>

      <NumberStatsCard stats={numberStats} />
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function NumberStatsCard({ stats }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeStartX = useRef(null);
  const lastSwitchRef = useRef(0);
  const activeStat = stats[clamp(activeIndex, 0, Math.max(0, stats.length - 1))];

  useEffect(() => {
    setActiveIndex((index) => clamp(index, 0, Math.max(0, stats.length - 1)));
  }, [stats.length]);

  function switchStat(direction) {
    if (stats.length <= 1) return;
    const now = Date.now();
    if (now - lastSwitchRef.current < 320) return;
    lastSwitchRef.current = now;
    setActiveIndex((index) => (index + direction + stats.length) % stats.length);
  }

  function handleWheel(event) {
    if (Math.abs(event.deltaX) < 18) return;
    event.preventDefault();
    switchStat(event.deltaX > 0 ? 1 : -1);
  }

  function handlePointerDown(event) {
    swipeStartX.current = event.clientX;
  }

  function handlePointerUp(event) {
    if (swipeStartX.current == null) return;
    const deltaX = event.clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(deltaX) < 34) return;
    switchStat(deltaX < 0 ? 1 : -1);
  }

  if (!activeStat) {
    return (
      <section className="number-stats-card" aria-label="Number habit statistics">
        <div>
          <p className="eyebrow">Numbers</p>
          <h2>No number habits</h2>
        </div>
      </section>
    );
  }

  const graph = buildLineGraph(activeStat.entries, activeStat.habit.target);

  return (
    <section
      className="number-stats-card"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartX.current = null;
      }}
      aria-label={`${activeStat.habit.name} number habit statistics`}
    >
      <div className="number-stats-header">
        <div>
          <p className="eyebrow">Numbers</p>
          <h2>{activeStat.habit.name}</h2>
        </div>
        <span>{activeIndex + 1} / {stats.length}</span>
      </div>

      <div className="number-metrics">
        <Metric label="Latest" value={formatStatNumber(activeStat.latest)} />
        <Metric label="Average" value={formatStatNumber(activeStat.average)} />
        <Metric label="Target" value={activeStat.habit.target ?? '-'} />
      </div>

      <div className="line-chart" aria-label={`${activeStat.habit.name} line graph`}>
        {graph.points ? (
          <svg viewBox="0 0 320 160" role="img" aria-label={`${activeStat.habit.name} values over time`}>
            <path className="line-grid" d="M18 38H302M18 80H302M18 122H302" />
            {activeStat.habit.target != null && graph.targetPath && <path className="target-line" d={graph.targetPath} />}
            <polyline className="line-path" points={graph.points} />
            {graph.circles.map((point) => (
              <circle className="line-point" cx={point.x} cy={point.y} r="3.5" key={`${point.x}-${point.y}`} />
            ))}
          </svg>
        ) : (
          <div className="chart-empty">No values yet</div>
        )}
      </div>
    </section>
  );
}

function GalleryTab({ entriesByHabit, habits }) {
  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const photoHabits = habits
    .filter((habit) => habit.type === 'photo')
    .map((habit) => ({
      habit,
      entries: (entriesByHabit.get(habit.id) ?? [])
        .filter((entry) => entry.photoData)
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));
  const totalPhotos = photoHabits.reduce((count, item) => count + item.entries.length, 0);
  const selectedFolder = photoHabits.find((item) => item.habit.id === selectedHabitId);

  if (!photoHabits.length) {
    return (
      <div className="gallery-tab tab-panel">
        <section className="gallery-empty">
          <p className="eyebrow">Gallery</p>
          <h2>No comparators yet</h2>
          <p>Add a photo habit from the home tab to start a visual progress log.</p>
        </section>
      </div>
    );
  }

  if (selectedFolder) {
    return (
      <GalleryFolderDetail
        entries={selectedFolder.entries}
        habit={selectedFolder.habit}
        onBack={() => setSelectedHabitId(null)}
      />
    );
  }

  return (
    <div className="gallery-tab tab-panel">
      <section className="gallery-hero">
        <div>
          <p className="eyebrow">Gallery</p>
          <h2>{totalPhotos ? `${totalPhotos} saved photo${totalPhotos === 1 ? '' : 's'}` : 'No photos yet'}</h2>
        </div>
      </section>

      <section className="gallery-folder-grid" aria-label="Comparator folders">
        {photoHabits.map(({ entries, habit }) => (
          <button className="gallery-folder" type="button" key={habit.id} onClick={() => setSelectedHabitId(habit.id)}>
            <span className="folder-cover">
              {entries.at(-1)?.photoData ? <img src={entries.at(-1).photoData} alt="" /> : <Camera size={18} strokeWidth={1.8} />}
            </span>
            <div>
              <strong>{habit.name}</strong>
              <small>{entries.length ? `${entries.length} photo${entries.length === 1 ? '' : 's'}` : 'Empty'}</small>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

function GalleryFolderDetail({ entries, habit, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, entries.length - 1));
  const [pickerOpen, setPickerOpen] = useState(false);
  const photoSwipeRef = useRef({ didSwipe: false, startY: null });
  const latestIndex = Math.max(0, entries.length - 1);
  const activeIndex = clamp(selectedIndex, 0, latestIndex);
  const firstEntry = entries[0];
  const activeEntry = entries[activeIndex];

  useEffect(() => {
    setSelectedIndex(Math.max(0, entries.length - 1));
  }, [entries.length, habit.id]);

  function moveSelection(direction) {
    setSelectedIndex((index) => clamp(index + direction, 0, latestIndex));
  }

  function handleSwipeStart(event) {
    photoSwipeRef.current = { didSwipe: false, startY: event.clientY };
  }

  function handleSwipeEnd(event) {
    if (photoSwipeRef.current.startY == null) return;
    const deltaY = event.clientY - photoSwipeRef.current.startY;
    photoSwipeRef.current.startY = null;
    if (Math.abs(deltaY) < 32) return;
    photoSwipeRef.current.didSwipe = true;
    moveSelection(deltaY < 0 ? -1 : 1);
    window.setTimeout(() => {
      photoSwipeRef.current.didSwipe = false;
    }, 160);
  }

  return (
    <div className="gallery-tab tab-panel">
      <section className="gallery-section">
        <div className="gallery-header">
          <button className="gallery-back" type="button" onClick={onBack} aria-label="Back to gallery folders">
            <ArrowLeft size={18} strokeWidth={1.8} />
            Folders
          </button>
          <div>
            <h3>{habit.name}</h3>
            <p>{entries.length ? `${entries.length} photo${entries.length === 1 ? '' : 's'} logged` : 'Waiting for day 1'}</p>
          </div>
        </div>

        {entries.length ? (
          <>
            <div className="gallery-comparison" aria-label={`${habit.name} photo comparison`}>
              <ComparisonPhoto entry={firstEntry} label="First photo" />
              <button
                className="comparison-photo comparison-photo-button"
                type="button"
                onClick={(event) => {
                  if (photoSwipeRef.current.didSwipe) {
                    event.preventDefault();
                    return;
                  }
                  setPickerOpen(true);
                }}
                onPointerDown={handleSwipeStart}
                onPointerUp={handleSwipeEnd}
                onPointerCancel={() => {
                  photoSwipeRef.current.startY = null;
                }}
                aria-label="Open photo gallery"
              >
                <img src={activeEntry.photoData} alt="Selected comparator" />
                <span>
                  <strong>{activeIndex === latestIndex ? 'Newest photo' : 'Selected photo'}</strong>
                  <small>{formatShortDate(activeEntry.date)}</small>
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="gallery-empty is-compact">
            <p>No pictures saved for this comparator.</p>
          </div>
        )}
      </section>

      {pickerOpen && (
        <PhotoPickerModal
          entries={entries}
          habit={habit}
          selectedIndex={activeIndex}
          onClose={() => setPickerOpen(false)}
          onSelect={(index) => {
            setSelectedIndex(index);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ComparisonPhoto({ entry, label }) {
  return (
    <figure className="comparison-photo">
      <img src={entry.photoData} alt={`${label} comparator`} />
      <figcaption>
        <strong>{label}</strong>
        <small>{formatShortDate(entry.date)}</small>
      </figcaption>
    </figure>
  );
}

function PhotoPickerModal({ entries, habit, selectedIndex, onClose, onSelect }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel pop-panel photo-picker-panel" role="dialog" aria-modal="true" aria-labelledby="photo-picker-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Gallery</p>
            <h2 id="photo-picker-title">{habit.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close photo gallery">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="photo-picker-grid">
          {entries.map((entry, index) => (
            <button
              className={index === selectedIndex ? 'photo-picker-item is-selected' : 'photo-picker-item'}
              type="button"
              key={`${habit.id}-${entry.date}`}
              onClick={() => onSelect(index)}
            >
              <img src={entry.photoData} alt={`${formatShortDate(entry.date)} comparator`} />
              <span>{formatShortDate(entry.date)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ onClearPhotos, onResetToday, onThemeChange, photoCount, theme }) {
  return (
    <div className="settings-tab tab-panel">
      <section className="settings-card">
        <div>
          <p className="eyebrow">Appearance</p>
          <h2>Color theme</h2>
        </div>
        <div className="theme-grid" role="radiogroup" aria-label="Color theme">
          {themeOptions.map((option) => (
            <button
              className={theme === option.id ? 'theme-choice is-active' : 'theme-choice'}
              type="button"
              key={option.id}
              onClick={() => onThemeChange(option.id)}
              role="radio"
              aria-checked={theme === option.id}
            >
              <span className="theme-swatch" style={{ '--swatch': option.swatch }} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Database</h2>
          <p>Habits and entries are persisted in Postgres through the Nenko API.</p>
        </div>
      </section>

      <section className="settings-list" aria-label="Settings actions">
        <button className="settings-row" type="button" onClick={onResetToday}>
          <span>
            <strong>Reset today</strong>
            <small>Clear today&apos;s entries for every habit.</small>
          </span>
          <Trash2 size={18} strokeWidth={1.7} />
        </button>
        <button className="settings-row" type="button" onClick={onClearPhotos}>
          <span>
            <strong>Clear photos</strong>
            <small>{photoCount ? `${photoCount} saved photo${photoCount === 1 ? '' : 's'}` : 'No photos saved'}</small>
          </span>
          <Trash2 size={18} strokeWidth={1.7} />
        </button>
      </section>
    </div>
  );
}

function TabNav({ activeTab, onTabChange }) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab),
  );

  return (
    <nav className="tab-nav" style={{ '--active-index': activeIndex }} aria-label="Primary navigation">
      <span className="tab-indicator" aria-hidden="true" />
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <button
            className={active ? 'tab-button is-active' : 'tab-button'}
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            title={tab.label}
          >
            <Icon size={20} strokeWidth={1.8} />
          </button>
        );
      })}
    </nav>
  );
}

function NumberHabitModal({ habit, initialValue, onClose, onSave }) {
  const [draft, setDraft] = useState(initialValue ?? habit.target ?? 1);

  const canSave = Number.isFinite(Number(draft)) && Number(draft) >= 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel pop-panel" role="dialog" aria-modal="true" aria-labelledby="number-modal-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Number habit</p>
            <h2 id="number-modal-title">{habit.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close modal">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="number-control">
          <button type="button" onClick={() => setDraft((value) => Math.max(0, Number(value || 0) - 1))} aria-label="Decrease">
            <Minus size={20} strokeWidth={1.8} />
          </button>
          <input
            autoFocus
            inputMode="decimal"
            min="0"
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Habit number"
          />
          <button type="button" onClick={() => setDraft((value) => Number(value || 0) + 1)} aria-label="Increase">
            <Plus size={20} strokeWidth={1.8} />
          </button>
        </div>

        <button className="save-button" type="button" disabled={!canSave} onClick={() => onSave(Number(draft))}>
          Save today
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function AddHabitModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('clock');
  const [target, setTarget] = useState(8);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && !saving;

  async function submit(event) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        type,
        target: type === 'number' ? Number(target) : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-panel pop-panel" role="dialog" aria-modal="true" aria-labelledby="add-modal-title" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">New habit</p>
            <h2 id="add-modal-title">Add habit</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close modal">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Evening walk" />
        </label>

        <div className="type-picker" role="radiogroup" aria-label="Habit type">
          {[
            ['clock', 'Clock-in'],
            ['number', 'Number'],
            ['photo', 'Photo'],
          ].map(([value, label]) => (
            <button
              className={type === value ? 'type-choice is-active' : 'type-choice'}
              type="button"
              key={value}
              onClick={() => setType(value)}
              role="radio"
              aria-checked={type === value}
            >
              {label}
            </button>
          ))}
        </div>

        {type === 'number' && (
          <label className="field">
            <span>Target</span>
            <input min="0" type="number" value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
        )}

        <button className="save-button" type="submit" disabled={!canSave}>
          {saving ? 'Saving...' : 'Create habit'}
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </form>
    </div>
  );
}

function ConfirmDeleteModal({ habit, isDeleting, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel pop-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div>
          <p className="eyebrow">Delete habit</p>
          <h2 id="delete-modal-title">{habit.name}</h2>
          <p>This removes the habit from your active list. Existing entries for it will be hidden with the habit.</p>
        </div>

        <div className="confirm-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isDeleting}>
            <Trash2 size={17} strokeWidth={1.8} />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoComparator({ entries, habit, onClearTodayEntry, onClockTodayEntry, onDeleteHabitRequest, onPhotoChange }) {
  const inputRef = useRef(null);
  const todayEntry = entries.find((entry) => entry.date === todayKey);
  const photoEntries = entries.filter((entry) => entry.photoData).sort((a, b) => a.date.localeCompare(b.date));
  const complete = isEntryComplete(todayEntry, habit.type);
  const progressText = complete
    ? todayEntry?.photoData
      ? 'Photo saved today'
      : 'Clocked today'
    : photoEntries.length
      ? `${photoEntries.length} in gallery`
      : 'Tap to add day 1';
  const openFilePicker = () => inputRef.current?.click();

  return (
    <SwipeHabitCard
      actionIcon={complete ? Minus : Camera}
      actionLabel={complete ? 'Unclock' : 'Photo'}
      actionVariant={complete ? 'unclock' : 'clock'}
      habit={habit}
      onDeleteRequest={onDeleteHabitRequest}
      onSwipeRight={() => {
        if (complete) {
          onClearTodayEntry(habit);
          return;
        }
        onClockTodayEntry(habit);
      }}
    >
      <article
        className={complete ? 'habit-card photo-card action-card animated-card is-complete-card' : 'habit-card photo-card action-card animated-card'}
        onClick={openFilePicker}
        onKeyDown={(event) => activateOnKeyboard(event, openFilePicker)}
        role="button"
        tabIndex={0}
      >
        <div className="card-topline">
          <span className="type-icon">
            <Camera size={18} strokeWidth={1.8} />
          </span>
          <span>Comparator</span>
        </div>

        <div>
          <h2>{habit.name}</h2>
          <p>{progressText}</p>
        </div>

        <span className={complete ? 'plain-button is-complete file-button' : 'plain-button file-button'}>
          {complete ? (todayEntry?.photoData ? 'Photo saved' : 'Clocked') : 'Take photo'}
          <Camera size={17} strokeWidth={1.8} />
        </span>
        <input
          accept="image/*"
          capture="environment"
          className="photo-input"
          ref={inputRef}
          type="file"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onPhotoChange(habit, event)}
        />
      </article>
    </SwipeHabitCard>
  );
}

function groupEntries(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const group = grouped.get(entry.habitId) ?? [];
    group.push(entry);
    grouped.set(entry.habitId, group);
  }
  return grouped;
}

function getTodayEntry(entriesByHabit, habitId) {
  return (entriesByHabit.get(habitId) ?? []).find((entry) => entry.date === todayKey);
}

function upsertEntry(entries, nextEntry) {
  const index = entries.findIndex((entry) => entry.habitId === nextEntry.habitId && entry.date === nextEntry.date);
  if (index === -1) return [...entries, nextEntry];
  return entries.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry));
}

function isEntryComplete(entry, type) {
  if (!entry) return false;
  if (type === 'clock') return entry.completed === true;
  if (type === 'number') return entry.completed === true || entry.value !== null;
  if (type === 'photo') return entry.completed === true || Boolean(entry.photoData);
  return false;
}

function buildProgressLog(entries, habits) {
  const types = new Map(habits.map((habit) => [habit.id, habit.type]));
  return entries.reduce((log, entry) => {
    const type = types.get(entry.habitId);
    if (!isEntryComplete(entry, type)) return log;
    return { ...log, [entry.date]: (log[entry.date] ?? 0) + 1 };
  }, {});
}

function buildProgressDays(progressLog) {
  const end = new Date(`${todayKey}T12:00:00`);
  const days = [];

  for (let offset = 111; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);

    const key = date.toISOString().slice(0, 10);
    const count = Math.max(0, Number(progressLog[key] ?? 0));

    days.push({
      count,
      date: key,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
  }

  return days;
}

function buildNumberStats(habits, entriesByHabit) {
  return habits
    .filter((habit) => habit.type === 'number')
    .map((habit) => {
      const entries = (entriesByHabit.get(habit.id) ?? [])
        .filter((entry) => entry.value !== null && Number.isFinite(Number(entry.value)))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);
      const values = entries.map((entry) => Number(entry.value));
      const total = values.reduce((sum, value) => sum + value, 0);

      return {
        average: values.length ? total / values.length : null,
        entries,
        habit,
        latest: values.at(-1) ?? null,
      };
    });
}

function buildLineGraph(entries, target) {
  const values = entries.map((entry) => Number(entry.value)).filter((value) => Number.isFinite(value));
  if (!values.length) return { circles: [], points: null, targetPath: null };

  const width = 320;
  const height = 160;
  const padX = 18;
  const padY = 22;
  const graphWidth = width - padX * 2;
  const graphHeight = height - padY * 2;
  const numericTarget = Number(target);
  const domainValues = Number.isFinite(numericTarget) ? [...values, numericTarget] : values;
  let min = Math.min(...domainValues);
  let max = Math.max(...domainValues);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const toPoint = (value, index) => {
    const x = values.length === 1 ? width / 2 : padX + (index / (values.length - 1)) * graphWidth;
    const y = padY + (1 - (value - min) / (max - min)) * graphHeight;
    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  };
  const circles = values.map(toPoint);
  const points = circles.map((point) => `${point.x},${point.y}`).join(' ');
  const targetPath = Number.isFinite(numericTarget)
    ? `M${padX} ${Number((padY + (1 - (numericTarget - min) / (max - min)) * graphHeight).toFixed(2))}H${width - padX}`
    : null;

  return { circles, points, targetPath };
}

function formatStatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  const number = Number(value);
  return Number.isInteger(number) ? number : number.toFixed(1);
}

function countPhotoEntries(entriesByHabit, habits) {
  return habits
    .filter((habit) => habit.type === 'photo')
    .reduce((count, habit) => count + (entriesByHabit.get(habit.id) ?? []).filter((entry) => entry.photoData).length, 0);
}

function activateOnKeyboard(event, action) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target !== event.currentTarget && event.target.closest('button, input, select, textarea, a')) return;
  event.preventDefault();
  action();
}

function formatShortDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => resolve(reader.result);
      image.onload = () => {
        const maxSize = 1100;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function BambooScene({ variant = 'splash' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let destroyed = false;
    let frame = 0;
    let resizeObserver;
    let renderer;
    let group;

    async function startScene() {
      const [{ default: threeNamespace, ...threeModule }, loaderModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);
      const THREE = { ...threeNamespace, ...threeModule };
      const { GLTFLoader } = loaderModule;

      if (destroyed) return;

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x141412, 8, 16);

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0.12, 6.35);

      group = new THREE.Group();
      scene.add(group);

      scene.add(new THREE.HemisphereLight(0xe8e6df, 0x141412, 2.1));

      const key = new THREE.DirectionalLight(0xe8e6df, 3.7);
      key.position.set(2.4, 4.5, 4);
      scene.add(key);

      const fill = new THREE.PointLight(0x6a9e8a, 1.4, 8);
      fill.position.set(-2.8, 0.4, 2.4);
      scene.add(fill);

      const loader = new GLTFLoader();
      loader.load(
        bambooUrl,
        (gltf) => {
          if (destroyed) return;

          const model = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(model);
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const maxAxis = Math.max(size.x, size.y, size.z) || 1;

          model.position.sub(center);
          model.scale.setScalar((variant === 'splash' ? 3.7 : 3.2) / maxAxis);
          model.rotation.set(
            THREE.MathUtils.degToRad(-4),
            THREE.MathUtils.degToRad(-34),
            THREE.MathUtils.degToRad(0),
          );
          model.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material.roughness = Math.min(child.material.roughness ?? 0.78, 0.84);
              child.material.envMapIntensity = 0.72;
            }
          });

          group.add(model);
        },
        undefined,
        () => {
          const fallback = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.22, 3.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x6a9e8a, roughness: 0.82 }),
          );
          fallback.rotation.z = THREE.MathUtils.degToRad(-6);
          group.add(fallback);
        },
      );

      const resize = () => {
        const box = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(box.width));
        const height = Math.max(1, Math.floor(box.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();

      const animate = () => {
        if (destroyed) return;
        frame = window.requestAnimationFrame(animate);
        const time = performance.now() * 0.001;

        group.rotation.y = Math.sin(time * 0.34) * 0.06;
        group.position.y = Math.sin(time * 0.5) * 0.025 - 0.02;

        renderer.render(scene, camera);
      };
      animate();
    }

    startScene();

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      group?.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer?.dispose();
    };
  }, [variant]);

  return (
    <div className="bamboo-stage" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default App;
