import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Camera,
  Check,
  ChevronRight,
  Hash,
  Home,
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
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
const typeLabels = {
  clock: 'Habit',
  number: 'Number',
  photo: 'Comparator',
};

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
        onArchiveHabit={archiveHabit}
        onClearPhotos={clearPhotos}
        onNumberHabit={setNumberHabit}
        onPhotoChange={addPhoto}
        onRefresh={refreshState}
        onResetToday={resetToday}
        onTabChange={setActiveTab}
        onToggleClock={toggleClock}
        progressLog={progressLog}
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
  onArchiveHabit,
  onClearPhotos,
  onNumberHabit,
  onPhotoChange,
  onRefresh,
  onResetToday,
  onTabChange,
  onToggleClock,
  progressLog,
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
          onArchiveHabit={onArchiveHabit}
          onNumberHabit={onNumberHabit}
          onPhotoChange={onPhotoChange}
          onToggleClock={onToggleClock}
        />
      )}

      {!error && !loading && activeTab === 'progress' && <ProgressTab progressLog={progressLog} />}

      {!error && !loading && activeTab === 'settings' && (
        <SettingsTab
          onClearPhotos={onClearPhotos}
          onResetToday={onResetToday}
          photoCount={countPhotoEntries(entriesByHabit, habits)}
        />
      )}

      <TabNav activeTab={activeTab} onTabChange={onTabChange} />
    </section>
  );
}

function HabitsTab({ entriesByHabit, habits, onAddHabit, onArchiveHabit, onNumberHabit, onPhotoChange, onToggleClock }) {
  return (
    <div className="habit-grid">
      <button className="add-habit-card" type="button" onClick={onAddHabit}>
        <span className="type-icon">
          <Plus size={18} strokeWidth={1.8} />
        </span>
        <strong>Add habit</strong>
        <small>Clock-in, number, or photo comparator</small>
      </button>

      {habits.map((habit) => (
        <HabitTile
          entries={entriesByHabit.get(habit.id) ?? []}
          habit={habit}
          key={habit.id}
          onArchiveHabit={onArchiveHabit}
          onNumberHabit={onNumberHabit}
          onPhotoChange={onPhotoChange}
          onToggleClock={onToggleClock}
        />
      ))}
    </div>
  );
}

function HabitTile({ entries, habit, onArchiveHabit, onNumberHabit, onPhotoChange, onToggleClock }) {
  const todayEntry = entries.find((entry) => entry.date === todayKey);

  if (habit.type === 'photo') {
    return (
      <PhotoComparator
        entries={entries}
        habit={habit}
        onArchiveHabit={onArchiveHabit}
        onPhotoChange={onPhotoChange}
      />
    );
  }

  const isClock = habit.type === 'clock';
  const complete = isEntryComplete(todayEntry, habit.type);
  const meta = isClock
    ? complete
      ? 'Completed today'
      : 'Waiting for check-in'
    : todayEntry?.value == null
      ? habit.target
        ? `Target ${habit.target}`
        : 'No value yet'
      : `${todayEntry.value} logged today`;

  return (
    <article className="habit-card animated-card">
      <div className="card-topline">
        <span className="type-icon">{isClock ? <Check size={18} strokeWidth={1.8} /> : <Hash size={18} strokeWidth={1.8} />}</span>
        <span>{typeLabels[habit.type]}</span>
        <button className="remove-button" type="button" onClick={() => onArchiveHabit(habit.id)} aria-label={`Archive ${habit.name}`}>
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>
      <div>
        <h2>{habit.name}</h2>
        <p>{meta}</p>
      </div>
      {isClock ? (
        <button className={complete ? 'plain-button is-complete' : 'plain-button'} type="button" onClick={() => onToggleClock(habit)}>
          {complete ? 'Clocked in' : 'Clock in'}
          <Check size={17} strokeWidth={1.8} />
        </button>
      ) : (
        <button className="plain-button" type="button" onClick={() => onNumberHabit(habit)}>
          {todayEntry?.value == null ? 'Enter number' : 'Update'}
          <Hash size={17} strokeWidth={1.8} />
        </button>
      )}
    </article>
  );
}

function ProgressTab({ progressLog }) {
  const days = useMemo(() => buildProgressDays(progressLog), [progressLog]);
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

function SettingsTab({ onClearPhotos, onResetToday, photoCount }) {
  return (
    <div className="settings-tab tab-panel">
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
  return (
    <nav className="tab-nav" aria-label="Primary navigation">
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
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{tab.label}</span>
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

function PhotoComparator({ entries, habit, onArchiveHabit, onPhotoChange }) {
  const photoEntries = entries.filter((entry) => entry.photoData).sort((a, b) => a.date.localeCompare(b.date));
  const firstPhoto = photoEntries[0];
  const latestPhoto = photoEntries.at(-1);
  const progressText = !photoEntries.length
    ? 'No photo yet'
    : photoEntries.length === 1
      ? 'Day 1 started'
      : `${photoEntries.length} photos logged`;

  return (
    <article className="habit-card photo-card animated-card">
      <div className="card-topline">
        <span className="type-icon">
          <Camera size={18} strokeWidth={1.8} />
        </span>
        <span>Comparator</span>
        <button className="remove-button" type="button" onClick={() => onArchiveHabit(habit.id)} aria-label={`Archive ${habit.name}`}>
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="photo-heading">
        <div>
          <h2>{habit.name}</h2>
          <p>{progressText}</p>
        </div>
        {photoEntries.length > 1 && (
          <span className="photo-count" aria-label={`${photoEntries.length} photos`}>
            {photoEntries.length}
          </span>
        )}
      </div>

      <div className="compare-grid">
        <PhotoFrame image={firstPhoto?.photoData} label="Day 1" />
        <PhotoFrame image={latestPhoto?.photoData} label="Today" />
      </div>

      <label className="plain-button file-button">
        Add today&apos;s photo
        <Camera size={17} strokeWidth={1.8} />
        <input accept="image/*" capture="environment" type="file" onChange={(event) => onPhotoChange(habit, event)} />
      </label>
    </article>
  );
}

function PhotoFrame({ image, label }) {
  return (
    <div className="photo-frame">
      {image ? <img src={image} alt={`${label} progress`} /> : <span />}
      <p>{label}</p>
    </div>
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
  if (type === 'number') return entry.value !== null;
  if (type === 'photo') return Boolean(entry.photoData);
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

function countPhotoEntries(entriesByHabit, habits) {
  return habits
    .filter((habit) => habit.type === 'photo')
    .reduce((count, habit) => count + (entriesByHabit.get(habit.id) ?? []).filter((entry) => entry.photoData).length, 0);
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
        group.position.y = Math.sin(time * 0.5) * 0.025 - 0.32;

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
