# Studio

React 19 + Vite 7 + Fluent UI v9 + React Flow, TypeScript. Static build, deployed to GitHub Pages at `studio.nexusgit.info`.

## Pages

| Route | Component | What it shows |
| --- | --- | --- |
| `/` | `ContractCanvas` | Agent graph (React Flow), headline metric cards, per-edge health table, fuzzer mode selector, **Run** and **Retest edge** actions |
| `/edges`, `/edges/:edgeId` | `PayloadDiffIndex`, `PayloadDiff` | Pick an edge and trace; field-by-field diff of expected contract vs. received payload |
| `/events` | `EventLog` | Telemetry backlog from persisted traces plus live frames |
| `/report` | `ReportExport` | Choose a run, strategies, title and notes; export a self-contained HTML report |

Pages are lazy-loaded. `BrowserRouter` is used, so the deploy workflow copies `index.html` to `404.html` to make deep links work on GitHub Pages.

## Structure

| Path | Role |
| --- | --- |
| `src/api/client.ts` | `fetch` wrapper, bearer header, 401 handling, WebSocket opening, `login`, `fetchAuthStatus`, `exchangeLoginCode`, `githubLoginUrl` |
| `src/api/auth.ts` | `sessionStorage` token helpers and the `gateway:auth-expired` event |
| `src/api/index.ts` | Exports the active `ApiClient` (`liveClient`) |
| `src/components/AuthGate.tsx` | Checks `/v1/auth/status`; shows the sign-in form when needed |
| `src/hooks/useTelemetrySocket.ts` | WebSocket lifecycle, reconnect, run state, trace and event accumulation |
| `src/hooks/TelemetryContext.tsx` | Shares one socket state with all pages |
| `src/hooks/useAsync.ts` | Small loading/error/ready state helper |
| `src/lib/metrics.ts` | Edge health, per-edge summaries, run metrics |
| `src/lib/diff.ts` | `buildDiffRows` |
| `src/lib/events.ts` | `frameToEvent` mapping telemetry frames to log rows |
| `src/lib/exportReport.ts` | HTML report generator |
| `src/lib/topology.ts` | Static copy of agents and edges |

## Gateway URL

`VITE_GATEWAY_URL` is read at **build time**. When empty, the studio uses same-origin URLs and the Vite dev server proxies `/health` and `/v1` (including WebSocket) to `GATEWAY_PROXY_URL` (default `http://localhost:8000`). The WebSocket URL is the HTTP origin with `http` replaced by `ws`, so `https://` becomes `wss://`.

## Authentication flow

```mermaid
sequenceDiagram
    participant U as User
    participant AG as AuthGate
    participant GW as Gateway
    AG->>GW: GET /v1/auth/status
    alt required and no token
        AG->>U: sign-in card (GitHub button and/or password form)
        U->>GW: Sign in with GitHub (full-page redirect)
        GW-->>AG: redirect to /?login_code=...
        AG->>GW: POST /v1/auth/exchange {code}
        GW-->>AG: JWT (stored in sessionStorage)
    end
    AG->>GW: REST calls with Authorization: Bearer
    Note over AG,GW: WebSocket: POST /v1/auth/ws-ticket, then connect with ?ticket=
    GW-->>AG: 401
    AG->>U: "Session expired", back to sign-in
```

The sign-in card is driven by `methods` from `/v1/auth/status`: a **Sign in with GitHub** button when GitHub is configured, a password form when `AUTH_PASSWORD` is set, or both. On return from GitHub the gate removes `login_code` / `login_error` from the URL immediately, exchanges the code once (guarded so React StrictMode cannot spend it twice) and shows a message for `login_error` values.

The token lives in `sessionStorage`, so it is cleared when the tab closes. Any 401 on an authenticated request clears it and re-shows the form.

## Live telemetry

`useTelemetrySocket` opens the socket once and reconnects with a growing delay (see [math.md](math.md#reconnect-backoff)). It merges persisted history (`api.listRecentEvents`) with live events and removes duplicates by event id. Frame handling:

- `RUN_STARTED`: set the active run, clear live traces, mark running.
- `TRACE_EMITTED`: prepend the trace (newest first).
- `RUN_COMPLETED`: stop running, bump `completedRuns` so views refetch persisted data.
- `ERROR`: stop running and surface the message.

## Payload diff

`buildDiffRows(edge, trace)` compares the contract fields with the delivered payload:

| Result | Condition |
| --- | --- |
| `Match` | field present and not named by any violation |
| `Mismatch` | field present and a violation path starts with it |
| `Missing` | contract field absent from the delivered payload |
| `Injected` | key present that is not in the contract (shown as `not allowed`) |

Violation paths are reduced to their first segment (`fields.0` counts against `fields`).

## Report export

`buildReportHtml` produces one HTML file with inline CSS and JS. Serialised data is embedded in a `<script>` with `<` escaped to `\u003c` and U+2028/2029 removed, and all text fields are HTML-escaped, so payload contents cannot inject markup. The report has summary cards, filter buttons (All, Violations, Breaches) and expandable original-vs-delivered payload panes.

## Tests

`npm test` runs Vitest on `src/tests/metrics.test.ts` (edge classification and per-edge aggregation).
