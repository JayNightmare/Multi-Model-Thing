# Adversarial Contract Tester — Documentation

A harness that sits between agents in a multi-agent workflow, deliberately corrupts the JSON they pass to each other, and records whether each hand-off contract caught the corruption and whether the downstream agent survived.

| Doc | Contents |
| --- | --- |
| [architecture.md](architecture.md) | Components, data flow, data model, HTTP and WebSocket API |
| [gateway.md](gateway.md) | Fastify service: contracts, interceptor, fuzzers, run orchestration, storage, auth |
| [fuzzer.md](fuzzer.md) | Python semantic fuzzer: strategies, mock engine, LLM engine |
| [studio.md](studio.md) | React console: pages, hooks, libraries, auth flow |
| [mcp.md](mcp.md) | MCP server for testing your own agents: sign-in, `.mml` folder, tools, security model |
| [math.md](math.md) | Every formula and probability model in the project |
| [operations.md](operations.md) | Configuration, deployment, security, troubleshooting |

## Vocabulary

- **Agent**: a node in the workflow (`extractor`, `synthesizer`, `decision-engine`, `audit-logger`).
- **Edge**: a directed hand-off between two agents. Each edge has a Zod schema, its **contract**.
- **Mutation**: a deliberate corruption of a payload (`TYPE_SWAP`, `KEY_OMISSION`, `BOUNDARY_OVERFLOW`, `SEMANTIC_DRIFT`).
- **Trace**: the record of one delivery across one edge (original payload, delivered payload, contract verdict, downstream outcome, latency).
- **Project**: a user's set of agents, edges, contracts and runs. The built-in `demo` project is shared; every other project is private to its owner.
- **Run**: one execution pass over the edges, producing a set of traces.
- **Violation**: the delivered payload fails the edge's schema.
- **Downstream status**: `HANDLED` (agent returned), `FAILED` (agent threw, a *breach*), `BYPASSED` (a mutation was applied but the payload still satisfied the contract).
- **Recovered**: the contract was violated but the downstream agent did not fail.

## Repository layout

```
gateway/   Fastify + TypeScript: contracts, interceptor, fuzzers, DuckDB storage, WebSocket telemetry, JWT auth
mcp/       @nexusgit/mml-mcp: local stdio MCP server so users can test their own agents
fuzzer/    FastAPI: semantic perturbation (local GGUF model, deterministic mock fallback)
studio/    React 19 + Vite + Fluent UI v9 console
docs/      This documentation
ecosystem.config.cjs   pm2 apps for the self-hosted deployment
docker-compose*.yml    Docker alternative, with Caddy for TLS
Caddyfile              Reverse proxy for gateway.nexusgit.info
.github/workflows/     Studio build and GitHub Pages deploy
```
