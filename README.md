# Adversarial Contract Tester

Multi-agent workflow contract tester with three modules:

- `gateway/` — Fastify + TypeScript daemon: Zod contract interception, WebSocket telemetry (`/v1/telemetry`), DuckDB trace storage. Port 8000.
- `fuzzer/` — FastAPI semantic fuzzer (local GGUF model, mock fallback). Port 8001.
- `studio/` — React 19 + Vite + Fluent UI v9 console.

Full documentation (architecture, code walkthrough, formulas, operations) is in [docs/](docs/README.md).

## Run

```
npm --prefix gateway install && npm --prefix gateway run dev
python -m venv fuzzer/.venv && fuzzer/.venv/bin/pip install -r fuzzer/requirements.txt
(cd fuzzer && .venv/bin/python -m app.main)
npm --prefix studio install && npm --prefix studio run dev
```

Copy `.env.example` for configuration. `docker-compose up` starts the gateway and fuzzer (ports bound to `127.0.0.1`).

## Authentication

The gateway is open unless GitHub sign-in or `AUTH_PASSWORD` is configured. When either is set, `JWT_SECRET` (32+ chars) is required and every route except `/health`, `/openapi.json` and `/v1/auth/*` needs a bearer token (HS256 JWT, `JWT_TTL_SECONDS`, default 3600).

**GitHub sign-in (studio)**

1. Create a GitHub OAuth App (Settings, Developer settings, OAuth Apps) with *Authorization callback URL* `https://gateway.nexusgit.info/v1/auth/github/callback` (or `<PUBLIC_URL>/v1/auth/github/callback`).
2. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ALLOWED_USERS` (comma-separated logins, **required**: anyone not listed is refused), `PUBLIC_URL` (the gateway) and `STUDIO_URL` (the studio), plus `JWT_SECRET`.
3. The studio's `/signin` page requires ticking the Terms and Privacy checkbox, then shows **Continue with GitHub**. After GitHub approves, the gateway checks the allowlist, records the accepted Terms version (`LEGAL_VERSION`, bump it when the legal text changes) and sends the browser back to `/signin` with a one-time code (valid 60 s), which the studio trades at `POST /v1/auth/exchange` for the JWT. The token never appears in a URL.

**Password login (scripts)**: if `AUTH_PASSWORD` is set, `POST /v1/auth/login` `{ "password": "..." }` returns `{ token, expiresAt }`. Repeated failures are rate limited. Scripts that post traces use this and send `Authorization: Bearer <token>`.

`POST /v1/auth/ws-ticket` (bearer required) returns a 30 s ticket; connect to `/v1/telemetry?ticket=...`, since browsers cannot send headers on a WebSocket.

## Replaying runs

Every run stores a `seed` (the run id by default). The heuristic fuzzer's key choices are derived from it, so `{ "type": "START_TEST_RUN", "fuzzerMode": "heuristic", "seed": "<earlier seed>" }` reproduces the same mutated payloads. Semantic mode is reproducible only when the fuzzer service is in mock mode or falls back to the heuristic engine.

The studio has a public site (landing page `/`, `/how-it-works`, `/terms`, `/privacy`, `/signin`) and the app under `/app` (canvas, payload diff, event log, report export, account), which requires sign-in. `GET /v1/auth/me` returns the signed-in user for the account page.

## Deploy (GitHub Pages + self-hosted gateway)

- **Studio** is built and published to `studio.nexusgit.info` by [deploy-studio.yml](.github/workflows/deploy-studio.yml) on pushes to `main`. Set the Pages source to GitHub Actions. The build reads `VITE_GATEWAY_URL` (repo variable, default `https://gateway.nexusgit.info`).
- **Gateway + fuzzer** run on your server behind a TLS-terminating reverse proxy for `gateway.nexusgit.info`. Without Docker, use pm2 and a host-installed Caddy (automatic TLS):

  ```
  cp .env.example .env   # set JWT_SECRET (openssl rand -hex 32), CORS_ORIGIN, and the GITHUB_* variables (see Authentication)
  npm --prefix gateway ci && npm --prefix gateway run build
  python3 -m venv fuzzer/.venv && fuzzer/.venv/bin/pip install -r fuzzer/requirements.txt
  pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
  GATEWAY_UPSTREAM=127.0.0.1:9012 GATEWAY_DOMAIN=gateway.nexusgit.info caddy run --config Caddyfile   # or install as a service
  ```

  Both apps listen on `127.0.0.1` only (ports are set in `ecosystem.config.cjs`); Caddy proxies to the gateway via `GATEWAY_UPSTREAM`. Without `models/model.gguf` the fuzzer runs in mock mode (`/health` reports `fuzzerMode: "mock"`); to enable the local model, `pip install -r fuzzer/requirements-llm.txt`, put a GGUF at `models/model.gguf`, and `pm2 restart fuzzer`.
- **With Docker** instead: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` (requires `JWT_SECRET` and the auth variables in `.env`; model goes in `./models`).
- **DNS:** `CNAME studio` to `<github-user>.github.io`; `A`/`AAAA gateway` to the server. Open only ports 80 and 443.

Traffic is encrypted with TLS (`https`/`wss`) from the browser to Caddy.

## Test

```
npm --prefix gateway test
npm --prefix studio test
(cd fuzzer && .venv/bin/python -m pytest)
```
