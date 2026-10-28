# MCP server (`mcp/`)

`@jaynightmare/mml-mcp` lets a user test their **own** agents. It is a local stdio MCP server that the user's AI assistant (VS Code, Claude Desktop, Cursor, ...) launches. The assistant calls the user's agents; Contract Tester prepares the corrupted payloads, judges the outcomes and shows the results in the studio. The server never runs user code.

```
assistant (editor) <--stdio--> mml-mcp <--HTTPS, Bearer mml_...--> gateway <--> studio (GitHub sign-in)
        |
        +--> user's real agents (called by the assistant itself)
```

## Setup

VS Code, `.vscode/mcp.json`:

```json
{ "servers": { "mml": { "type": "stdio", "command": "npx", "args": ["-y", "@jaynightmare/mml-mcp"] } } }
```

Claude Desktop, Cursor and others:

```json
{ "mcpServers": { "mml": { "command": "npx", "args": ["-y", "@jaynightmare/mml-mcp"] } } }
```

Requires Node 20+.

| Variable | Purpose |
| --- | --- |
| `MML_API_URL` | Gateway base URL. Default `https://gateway.jaynightmare.info`. Must be `https`, except for `localhost`. |
| `MML_HOME` | Where credentials are stored. Default `~/.mml`. |
| `MML_WORKSPACE` | Workspace root for the `.mml` folder. Default: the current directory. |

## Workflow

1. `mml_login` returns a link and a short code. The user opens the link in the studio (signed in with GitHub), checks the code and approves. `mml_login_status` then stores the token in `~/.mml/credentials.json` (mode `0600`).
2. `mml_init` creates a project on the gateway and the `.mml/` folder in the workspace.
3. The prompt `mml-define-contracts` guides the assistant: find the agents, collect synthetic sample payloads per hand-off, `mml_infer_schema`, tighten the draft, `mml_set_workflow`.
4. The prompt `mml-run-pass` guides a run: `mml_start_run` returns one case at a time; the assistant sends the payload exactly as given to the named agent and calls `mml_report_result` with whether it handled it. Repeat until the final summary is returned.
5. Results appear in the studio under the project as they arrive. `mml_dashboard_url` gives the link.

## Tools

| Tool | Purpose |
| --- | --- |
| `mml_login`, `mml_login_status`, `mml_logout`, `mml_whoami` | Device sign-in and session |
| `mml_list_projects`, `mml_init` | Projects and the `.mml` folder |
| `mml_infer_schema` | Draft a JSON Schema from sample payloads |
| `mml_set_workflow` | Save agents, edges, contracts and baseline payloads (replaces the previous workflow) |
| `mml_status` | Workspace, project and workflow state |
| `mml_start_run`, `mml_report_result` | Assistant-driven run, one case at a time (max 100 cases) |
| `mml_run_summary`, `mml_dashboard_url` | Read results, open the studio |

Resources: `mml://workflow` and `mml://latest-run`. Prompts: `mml-define-contracts`, `mml-run-pass`.

## The `.mml` folder

Non-secret context for the workspace. Safe to commit.

| File | Contents |
| --- | --- |
| `config.json` | Project id and gateway URL |
| `workflow.json` | Agents, edges, JSON Schema contracts, baseline payloads |
| `runs/<runId>.json` | Per-run counts, no payloads |
| `latest.md` | Readable summary of the latest run |
| `README.md`, `.gitignore` | Explanation; ignores nothing sensitive because nothing sensitive is stored |

Writes refuse symlinks that escape the workspace.

## Gateway side

Contracts for user projects are JSON Schema (Ajv 8 strict mode, no format validation, root `type: "object"`, remote `$ref` rejected, `$schema`/`$id` ignored, 64 KiB limit), held by `ContractRegistry` in [gateway/src/contracts/registry.ts](../gateway/src/contracts/registry.ts). The built-in demo keeps its three edges in [demo.ts](../gateway/src/contracts/demo.ts).

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/device/code` | none | Start sign-in; returns `device_code`, `user_code`, `verification_uri` |
| `POST /v1/device/token` | none | Poll; returns `{ access_token: "mml_...", expires_in }` after approval |
| `GET /v1/device/lookup`, `POST /v1/device/approve` | web session | Studio approval page |
| `GET /v1/tokens`, `DELETE /v1/tokens/:id` | web session | Connected tools (Account page) |
| `GET/POST /v1/projects`, `DELETE /v1/projects/:id` | session or MCP token | Projects |
| `GET/PUT /v1/projects/:id/workflow`, `GET .../topology` | session or MCP token | Workflow and canvas layout |
| `POST /v1/projects/:id/runs`, `POST /v1/runs/:id/next`, `POST /v1/runs/:id/cases/:caseId/result` | session or MCP token | Assistant-driven run |

## Security model

- Tokens are random, prefixed `mml_`, stored only as a hash, expire after `MCP_TOKEN_TTL_DAYS` (default 30) and can be revoked on the Account page.
- An MCP token may use only the project, run, trace, `me` and logout endpoints. It cannot approve devices, list or revoke tokens, or mint anything: those need the web session JWT, so a leaked token cannot spread.
- Device codes live in memory, expire in 10 minutes, must be polled no faster than every 5 s (`slow_down` otherwise) and yield a token only once. The user must be signed in on the studio and compare the code shown there with the one in the editor.
- Projects are owner-only (other users get 404). The demo project is visible to everyone but its runs are private to the user who started them. Run ids are owned; reusing another user's id is a conflict.
- Telemetry over WebSocket is scoped per user.
- Baseline and mutated payloads are stored on the gateway. Tell users to use synthetic data.

## Limitations

- Device codes are in memory, so a gateway restart invalidates pending sign-ins (the user just retries).
- The project is chosen from `.mml/config.json` per workspace, not a global setting.
- Sign-in to approve a device follows `GITHUB_ALLOWED_USERS`: `*` for any GitHub account, or a restricted list. With open sign-in, isolation between users rests on the per-owner scoping above, and per-user caps (3 active assistant runs, 100 cases per run, project count) limit abuse.
