# Nenko

Nenko is a dark-mode habit tracker with a bamboo splash screen, three habit types, a GitHub-style progress grid, and Postgres persistence.

## Docker Compose

The compose setup uses non-default host ports:

- App: `http://127.0.0.1:7319`
- Postgres: `127.0.0.1:55437`

Run:

```bash
docker compose up --build
```

The app container serves the built React frontend and the API from the same origin.

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

## Habit Types

- `Habit`: simple clock-in for the day.
- `Number`: opens a modal for a numeric entry.
- `Comparator`: stores a daily photo and compares day 1 with today.
