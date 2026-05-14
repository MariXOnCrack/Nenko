import pg from 'pg';

const { Pool } = pg;

const DEFAULT_HABITS = [
  { name: 'Morning practice', type: 'clock', target: null },
  { name: 'Water intake', type: 'number', target: 8 },
  { name: 'Visual progress', type: 'photo', target: null },
];

export const DEFAULT_NTFY_SETTINGS = {
  enabled: false,
  serverUrl: process.env.NTFY_DEFAULT_SERVER_URL ?? 'https://ntfy.sh',
  topic: process.env.NTFY_DEFAULT_TOPIC ?? '',
  title: 'Nenko',
  message: '{count} habit{plural} left today: {habits}',
  priority: 3,
  tags: 'seedling',
  reminders: [
    { id: 'morning', label: 'Morning', time: '06:00', enabled: true },
    { id: 'evening', label: 'Evening', time: '17:00', enabled: true },
  ],
  onlyIfIncomplete: true,
  authToken: '',
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://nenko:nenko_dev_password@127.0.0.1:55437/nenko',
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export async function initDb() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS habits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      type text NOT NULL CHECK (type IN ('clock', 'number', 'photo')),
      target numeric,
      archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS habit_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      entry_date date NOT NULL,
      completed boolean,
      value_numeric numeric,
      photo_data text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (habit_id, entry_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT count(*)::int AS count FROM habits');
  if (rows[0].count === 0) {
    for (const habit of DEFAULT_HABITS) {
      await pool.query('INSERT INTO habits (name, type, target) VALUES ($1, $2, $3)', [
        habit.name,
        habit.type,
        habit.target,
      ]);
    }
  }
}

export async function getAppSetting(key, fallback = null) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function setAppSetting(key, value) {
  const { rows } = await pool.query(
    `
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      RETURNING value
    `,
    [key, value],
  );
  return rows[0].value;
}

export function mapHabit(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    target: row.target === null ? null : Number(row.target),
    archived: row.archived,
    createdAt: row.created_at,
  };
}

export function mapEntry(row) {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: toDateKey(row.entry_date),
    completed: row.completed,
    value: row.value_numeric === null ? null : Number(row.value_numeric),
    photoData: row.photo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
