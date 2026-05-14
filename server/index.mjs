import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NTFY_SETTINGS, getAppSetting, initDb, mapEntry, mapHabit, pool, setAppSetting } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number.parseInt(process.env.PORT ?? '7319', 10);
const ntfySettingKey = 'ntfy';
const sentNtfyReminderKeys = new Set();

const app = express();

app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/state', async (_request, response, next) => {
  try {
    const [habitsResult, entriesResult, ntfySettings] = await Promise.all([
      pool.query('SELECT * FROM habits WHERE archived = false ORDER BY created_at ASC'),
      pool.query('SELECT * FROM habit_entries ORDER BY entry_date ASC, created_at ASC'),
      getNtfySettings(),
    ]);

    response.json({
      habits: habitsResult.rows.map(mapHabit),
      entries: entriesResult.rows.map(mapEntry),
      ntfySettings,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings/ntfy', async (_request, response, next) => {
  try {
    response.json({ ntfySettings: await getNtfySettings() });
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings/ntfy', async (request, response, next) => {
  try {
    const ntfySettings = normalizeNtfySettings(request.body, { allowEmptyTopic: true });
    await setAppSetting(ntfySettingKey, ntfySettings);
    response.json({ ntfySettings });
  } catch (error) {
    if (error.statusCode) return response.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.post('/api/ntfy/test', async (request, response, next) => {
  try {
    const ntfySettings = normalizeNtfySettings(request.body);
    await publishNtfy(ntfySettings, {
      title: ntfySettings.title || 'Nenko',
      message: 'Nenko test notification.',
    });
    response.json({ ok: true });
  } catch (error) {
    if (error.statusCode) return response.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

app.post('/api/habits', async (request, response, next) => {
  try {
    const name = String(request.body.name ?? '').trim();
    const type = String(request.body.type ?? '').trim();
    const target = request.body.target === '' || request.body.target == null ? null : Number(request.body.target);

    if (!name) return response.status(400).json({ error: 'Habit name is required.' });
    if (!['clock', 'number', 'photo'].includes(type)) return response.status(400).json({ error: 'Invalid habit type.' });
    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      return response.status(400).json({ error: 'Target must be a positive number.' });
    }

    const { rows } = await pool.query(
      'INSERT INTO habits (name, type, target) VALUES ($1, $2, $3) RETURNING *',
      [name, type, target],
    );
    response.status(201).json({ habit: mapHabit(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/habits/:id', async (request, response, next) => {
  try {
    const archived = request.body.archived === true;
    const { rows } = await pool.query('UPDATE habits SET archived = $2 WHERE id = $1 RETURNING *', [
      request.params.id,
      archived,
    ]);
    if (!rows.length) return response.status(404).json({ error: 'Habit not found.' });
    response.json({ habit: mapHabit(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/entries/:habitId/:date', async (request, response, next) => {
  try {
    const { habitId, date } = request.params;
    const completed = request.body.completed == null ? null : request.body.completed === true;
    const value = request.body.value == null || request.body.value === '' ? null : Number(request.body.value);
    const photoData = request.body.photoData == null ? null : String(request.body.photoData);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return response.status(400).json({ error: 'Invalid date.' });
    if (value !== null && !Number.isFinite(value)) return response.status(400).json({ error: 'Invalid numeric value.' });

    const { rows } = await pool.query(
      `
        INSERT INTO habit_entries (habit_id, entry_date, completed, value_numeric, photo_data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (habit_id, entry_date)
        DO UPDATE SET
          completed = EXCLUDED.completed,
          value_numeric = EXCLUDED.value_numeric,
          photo_data = COALESCE(EXCLUDED.photo_data, habit_entries.photo_data),
          updated_at = now()
        RETURNING *
      `,
      [habitId, date, completed, value, photoData],
    );

    response.json({ entry: mapEntry(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/entries/:habitId/:date', async (request, response, next) => {
  try {
    await pool.query('DELETE FROM habit_entries WHERE habit_id = $1 AND entry_date = $2', [
      request.params.habitId,
      request.params.date,
    ]);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/photos', async (_request, response, next) => {
  try {
    await pool.query(
      `DELETE FROM habit_entries
       USING habits
       WHERE habit_entries.habit_id = habits.id AND habits.type = 'photo'`,
    );
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Unexpected server error.' });
});

await initDb();
startNtfyReminderLoop();
app.listen(port, '0.0.0.0', () => {
  console.log(`Nenko listening on http://0.0.0.0:${port}`);
});

async function getNtfySettings() {
  const saved = await getAppSetting(ntfySettingKey, {});
  const merged = { ...DEFAULT_NTFY_SETTINGS, ...saved };
  if (!Array.isArray(saved.reminders) && saved.reminderTime) delete merged.reminders;
  return normalizeNtfySettings(merged, { allowEmptyTopic: true });
}

function normalizeNtfySettings(input = {}, options = {}) {
  const settings = {
    ...DEFAULT_NTFY_SETTINGS,
    enabled: input.enabled === true,
    serverUrl: String(input.serverUrl ?? DEFAULT_NTFY_SETTINGS.serverUrl).trim(),
    topic: String(input.topic ?? '').trim(),
    title: String(input.title ?? DEFAULT_NTFY_SETTINGS.title).trim(),
    message: String(input.message ?? DEFAULT_NTFY_SETTINGS.message).trim(),
    priority: Number(input.priority ?? DEFAULT_NTFY_SETTINGS.priority),
    tags: String(input.tags ?? DEFAULT_NTFY_SETTINGS.tags).trim(),
    reminders: normalizeNtfyReminders(input.reminders ?? input.reminderTime),
    onlyIfIncomplete: input.onlyIfIncomplete !== false,
    authToken: String(input.authToken ?? '').trim(),
  };

  if (!settings.title) settings.title = DEFAULT_NTFY_SETTINGS.title;
  if (!settings.message) settings.message = DEFAULT_NTFY_SETTINGS.message;
  if (!Number.isInteger(settings.priority) || settings.priority < 1 || settings.priority > 5) {
    throw badRequest('Priority must be between 1 and 5.');
  }
  try {
    const url = new URL(settings.serverUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    settings.serverUrl = url.toString().replace(/\/$/, '');
  } catch {
    throw badRequest('ntfy server URL must be a valid http or https URL.');
  }

  if (settings.topic && !/^[A-Za-z0-9_-]{1,64}$/.test(settings.topic)) {
    throw badRequest('Topic can only use letters, numbers, dashes, and underscores.');
  }
  if (!settings.topic && (settings.enabled || !options.allowEmptyTopic)) throw badRequest('Topic is required.');
  if (settings.enabled && !settings.reminders.some((reminder) => reminder.enabled)) {
    throw badRequest('Add at least one enabled reminder.');
  }

  return settings;
}

function normalizeNtfyReminders(input) {
  const source = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? [{ id: 'reminder', label: 'Reminder', time: input, enabled: true }]
      : DEFAULT_NTFY_SETTINGS.reminders;

  const ids = new Set();
  return source.map((reminder, index) => {
    const id = sanitizeReminderId(reminder.id, index, ids);
    const label = String(reminder.label ?? `Reminder ${index + 1}`).trim().slice(0, 32) || `Reminder ${index + 1}`;
    const time = String(reminder.time ?? '').trim();

    validateReminderTime(time);
    return {
      id,
      label,
      time,
      enabled: reminder.enabled !== false,
    };
  });
}

function sanitizeReminderId(value, index, ids) {
  let id = String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  if (!id) id = `reminder-${index + 1}`;
  while (ids.has(id)) id = `${id}-${index + 1}`;
  ids.add(id);
  return id;
}

function validateReminderTime(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) throw badRequest('Reminder times must be HH:mm.');
  const [hours, minutes] = time.split(':').map(Number);
  if (hours > 23 || minutes > 59) throw badRequest('Reminder times must be valid times.');
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function publishNtfy(settings, payload) {
  const ntfySettings = normalizeNtfySettings(settings);
  const url = new URL(`${encodeURIComponent(ntfySettings.topic)}`, `${ntfySettings.serverUrl}/`);
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: payload.title || ntfySettings.title,
    Priority: String(ntfySettings.priority),
  };

  if (ntfySettings.tags) headers.Tags = ntfySettings.tags;
  if (ntfySettings.authToken) headers.Authorization = `Bearer ${ntfySettings.authToken}`;

  let result;
  try {
    result = await fetch(url, {
      method: 'POST',
      headers,
      body: payload.message,
    });
  } catch (error) {
    const ntfyError = new Error(`ntfy request failed: ${error.message}`);
    ntfyError.statusCode = 502;
    throw ntfyError;
  }

  if (!result.ok) {
    const text = await result.text().catch(() => '');
    const ntfyError = new Error(text || `ntfy returned HTTP ${result.status}.`);
    ntfyError.statusCode = 502;
    throw ntfyError;
  }
}

function startNtfyReminderLoop() {
  const run = () => {
    sendDueNtfyReminder().catch((error) => {
      console.error('ntfy reminder failed:', error);
    });
  };

  setInterval(run, 30_000).unref?.();
  run();
}

async function sendDueNtfyReminder() {
  const settings = await getNtfySettings();
  if (!settings.enabled || !settings.topic) return;

  const now = new Date();
  const localDate = formatLocalDate(now);
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dueReminders = settings.reminders.filter((reminder) => reminder.enabled && reminder.time === localTime);
  if (!dueReminders.length) return;

  pruneSentReminderKeys(localDate);

  const [habitsResult, entriesResult] = await Promise.all([
    pool.query('SELECT * FROM habits WHERE archived = false ORDER BY created_at ASC'),
    pool.query('SELECT * FROM habit_entries WHERE entry_date = $1', [localDate]),
  ]);
  const habits = habitsResult.rows.map(mapHabit);
  const entriesByHabit = new Map(entriesResult.rows.map((row) => [row.habit_id, mapEntry(row)]));
  const incomplete = habits.filter((habit) => !isEntryComplete(entriesByHabit.get(habit.id), habit.type));

  const names = incomplete.map((habit) => habit.name).join(', ');
  for (const reminder of dueReminders) {
    const reminderKey = `${localDate}-${reminder.id}-${reminder.time}`;
    if (sentNtfyReminderKeys.has(reminderKey)) continue;

    if (settings.onlyIfIncomplete && incomplete.length === 0) {
      sentNtfyReminderKeys.add(reminderKey);
      continue;
    }

    await publishNtfy(settings, {
      title: renderNtfyTemplate(settings.title, incomplete, habits, names, reminder),
      message: renderNtfyTemplate(settings.message, incomplete, habits, names, reminder),
    });
    sentNtfyReminderKeys.add(reminderKey);
  }
}

function renderNtfyTemplate(template, incomplete, habits, names, reminder) {
  return template
    .replaceAll('{count}', String(incomplete.length))
    .replaceAll('{total}', String(habits.length))
    .replaceAll('{habits}', names || 'all habits complete')
    .replaceAll('{plural}', incomplete.length === 1 ? '' : 's')
    .replaceAll('{reminder}', reminder.label);
}

function pruneSentReminderKeys(localDate) {
  for (const key of sentNtfyReminderKeys) {
    if (!key.startsWith(`${localDate}-`)) sentNtfyReminderKeys.delete(key);
  }
}

function isEntryComplete(entry, type) {
  if (!entry) return false;
  if (type === 'clock') return entry.completed === true;
  if (type === 'number') return entry.completed === true || entry.value !== null;
  if (type === 'photo') return entry.completed === true || Boolean(entry.photoData);
  return false;
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
