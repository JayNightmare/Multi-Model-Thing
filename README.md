# Adversarial Contract Tester

Multi-agent workflow contract tester with three modules:

- `gateway/` — Fastify + TypeScript daemon: Zod contract interception, WebSocket telemetry (`/v1/telemetry`), DuckDB trace storage. Port 8000.
- `fuzzer/` — FastAPI semantic fuzzer (local GGUF model, mock fallback). Port 8001.
- `studio/` — React 19 + Vite + Fluent UI v9 console.

## Run

```
npm --prefix gateway install && npm --prefix gateway run dev
python -m venv fuzzer/.venv && fuzzer/.venv/bin/pip install -r fuzzer/requirements.txt
(cd fuzzer && .venv/bin/python -m app.main)
npm --prefix studio install && npm --prefix studio run dev
```

Copy `.env.example` for configuration. `docker-compose up` starts the gateway and fuzzer (ports bound to `127.0.0.1`).

## Authentication

The gateway is open unless `AUTH_PASSWORD` is set. When set, `JWT_SECRET` (32+ chars) is required and every route except `/health`, `/openapi.json` and `/v1/auth/*` needs a bearer token.

- `POST /v1/auth/login` `{ "password": "..." }` returns `{ token, expiresAt }` (HS256, `JWT_TTL_SECONDS`, default 3600). Repeated failures are rate limited.
- `POST /v1/auth/ws-ticket` (bearer required) returns a 30s ticket; connect to `/v1/telemetry?ticket=...`, since browsers cannot send headers on a WebSocket.
- Scripts that post traces must log in first and send `Authorization: Bearer <token>`.

The studio shows a sign-in form when the gateway requires auth.

## Deploy (GitHub Pages + self-hosted gateway)

- **Studio** is built and published to `studio.nexusgit.info` by [deploy-studio.yml](.github/workflows/deploy-studio.yml) on pushes to `main`. Set the Pages source to GitHub Actions. The build reads `VITE_GATEWAY_URL` (repo variable, default `https://gateway.nexusgit.info`).
- **Gateway + fuzzer** run on your server behind Caddy, which provisions TLS for `gateway.nexusgit.info`:

  ```
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  ```

  Requires `AUTH_PASSWORD` and `JWT_SECRET` in `.env` (`openssl rand -hex 32`). `CORS_ORIGIN` defaults to `https://studio.nexusgit.info`. Put the GGUF model in `./models`.
- **DNS:** `CNAME studio` to `<github-user>.github.io`; `A`/`AAAA gateway` to the server. Open only ports 80 and 443.

Traffic is encrypted with TLS (`https`/`wss`) from the browser to Caddy.

## Test

```
npm --prefix gateway test
npm --prefix studio test
(cd fuzzer && .venv/bin/python -m pytest)
```
