# Job Card Agent

A demo-ready field service job card application with backend AI helpers, n8n webhook support, and environment-driven frontend/backend configuration.

## Demo setup

- Frontend base URL: configure `VITE_API_BASE_URL` in the root `.env` file.
- Backend environment: copy `backend/.env.example` and set `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, and optional `OPENAI_API_KEY`, `N8N_WEBHOOK_URL`.
- Seed demo users with `npm --prefix backend run seed:demo`.

## Backend additions

- Added `/api/ai/*` endpoints for work description cleanup, job summaries, and PDF readiness.
- Added `backend/services/openai` and `backend/services/n8n` helpers with fallback behavior when external integration keys are missing.
- Added lightweight dev-mode auth support using `X-DEV-USER-ID` and `X-DEV-USER-ROLE` headers.
- Extended job creation to persist `equipment_name`, customer contact fields, pricing data, `parts`, and `labor`.
- Added `backend/scripts/seedDemoUsers.js` for development user bootstrapping.

## Frontend additions

- Added `src/lib/api.ts` to centralize the backend URL and dev auth headers.
- Updated `JobList` and `JobCardForm` to use environment-driven API URLs and role-based dev authentication.
