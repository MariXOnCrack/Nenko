import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, mapEntry, mapHabit, pool } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number.parseInt(process.env.PORT ?? '7319', 10);

const app = express();

app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/state', async (_request, response, next) => {
  try {
    const [habitsResult, entriesResult] = await Promise.all([
      pool.query('SELECT * FROM habits WHERE archived = false ORDER BY created_at ASC'),
      pool.query('SELECT * FROM habit_entries ORDER BY entry_date ASC, created_at ASC'),
    ]);

    response.json({
      habits: habitsResult.rows.map(mapHabit),
      entries: entriesResult.rows.map(mapEntry),
    });
  } catch (error) {
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
app.listen(port, '0.0.0.0', () => {
  console.log(`Nenko listening on http://0.0.0.0:${port}`);
});
