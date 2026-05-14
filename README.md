# Nenko

Nenko is a dark-mode habit tracker with a bamboo splash screen, three habit types, a GitHub-style progress grid, and Postgres persistence.

## Docker Compose

The compose setup uses non-default host ports:

- App: `http://127.0.0.1:7319`
- Postgres: `127.0.0.1:55437`
- ntfy: `http://127.0.0.1:7721`

Run:

```bash
docker compose up --build
```

The app container serves the built React frontend and the API from the same origin. The bundled ntfy container is pre-wired for reminder publishing with:

- ntfy publish URL inside Docker: `http://nenko-ntfy`
- default topic: `nenko-reminders`

Open the ntfy web UI at `http://127.0.0.1:7721`, subscribe to `nenko-reminders`, then customize the reminder list from Nenko Settings.

### iPhone notifications

For iPhone delivery from the bundled ntfy server, `NTFY_PUBLIC_BASE_URL` must be the exact reverse-proxied URL your iPhone can open. This repo defaults to your ntfy domain:

```bash
NTFY_PUBLIC_BASE_URL=https://ntfy.marix.lol docker compose up --build
```

In the ntfy iOS app, set the default server to `https://ntfy.marix.lol` and subscribe to `nenko-reminders`. Do not use `127.0.0.1` on iPhone, because that points to the phone itself.

The compose file sets `NTFY_UPSTREAM_BASE_URL=https://ntfy.sh`, which ntfy requires for instant iOS push notifications on self-hosted servers. It also sets `NTFY_BEHIND_PROXY=true`, which ntfy recommends when running behind a reverse proxy.

## Local Development

Start only the database with Docker, then run the API and Vite separately:

```bash
docker compose up nenko-db
npm run api
npm run dev
```

Local dev ports:

- Vite frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8724`
- Postgres: `127.0.0.1:55437`
- ntfy, when started from compose: `http://127.0.0.1:7721`

## Habit Types

- `Habit`: simple clock-in for the day.
- `Number`: opens a modal for a numeric entry.
- `Comparator`: stores a daily photo and compares day 1 with today.

## ntfy Reminders

Settings includes a customizable ntfy reminder list. You can add multiple reminder times, such as `06:00` and `17:00`, name each reminder, enable or disable individual rows, change priority/tags, and send a test notification.
