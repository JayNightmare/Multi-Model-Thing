# Semantic Fuzzer

FastAPI service (`fuzzer/app/`). It receives a payload and a strategy and returns a subtly corrupted payload meant to break *implicit* downstream assumptions rather than JSON syntax.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ "status": "healthy", "mode": "llm" \| "mock" }` |
| POST | `/v1/perturb` | Body `{ payload, strategy, contractHint?, temperature? }`, returns `{ perturbed, strategy, mode }` |

Request validation (Pydantic): `strategy` is one of `INVERT_LOGIC`, `AMBIGUOUS_DRIFT`, `HALLUCINATE_CONSTRAINTS` (default `AMBIGUOUS_DRIFT`); `temperature` is in [0, 1.5] (default 0.7); `payload` must be an object.

CORS allows `CORS_ORIGIN` entries plus localhost. Environment: `HOST`, `PORT`, `FUZZER_MODEL_PATH`, `N_CTX` (default 4096), `N_GPU_LAYERS` (default -1, all layers), `CORS_ORIGIN`.

## Modes

`LlmEngine.load()` runs at startup:

1. If `FUZZER_MODEL_PATH` does not exist: **mock mode**.
2. If `llama-cpp-python` is not installed: **mock mode**.
3. Otherwise load the GGUF model (`chat_format="chatml"`): **llm mode**.

In llm mode, if the model returns unusable output (invalid JSON, missing `mutated_payload`, non-object), the request is served by the mock engine instead and the response says `mode: "mock"`.

`/v1/perturb` is a synchronous handler so FastAPI runs it in a worker thread; inference does not block the event loop.

## Strategies

| Strategy | Intent | Mock implementation |
| --- | --- | --- |
| `INVERT_LOGIC` | Flip meaning while staying grammatical | Booleans negated; strings mapped through an opposites table (`APPROVE`/`REJECT`, `ALLOW`/`DENY`, `PASS`/`FAIL`, `OPEN`/`CLOSED`), unknown strings unchanged; numbers negated; nested dicts recursed |
| `AMBIGUOUS_DRIFT` | Replace exact values with hedged prose | Floats in [0, 1] become `"very high"` (≥ 0.8), `"moderate"` (≥ 0.4) or `"low"`; other numbers become `"roughly N"` (rounded to tens when \|x\| ≥ 10, else to an integer); ALL-CAPS strings become `"<lower> unless the risk is low"`; booleans untouched |
| `HALLUCINATE_CONSTRAINTS` | Inject plausible fields, null a key identifier | Sets the first key ending in `id` (else the first key) to `null`; adds `override_policy: "SKIP_AUDIT"` and `compliance_note: "pre-approved under exception 7.4"` |

The mock engine is deterministic, so runs in mock mode are reproducible. Python's `round()` uses banker's rounding, so `round(85, -1)` is 80 and `round(75, -1)` is 80.

## LLM prompt

The system prompt tells the model to act as an adversarial red-teamer, keep unmodified keys intact, and answer only with:

```json
{ "mutated_payload": { }, "delta_summary": "what changed" }
```

The user message contains the strategy name, its objective text, the optional plain-language contract hint, and the original payload. Generation uses `response_format={"type": "json_object"}`, `max_tokens=1024` and the requested `temperature`.

## Optional dependencies

`requirements.txt` is enough for mock mode. `requirements-llm.txt` adds `llama-cpp-python` for real inference. Without a model file the service still reports `healthy`; check `mode` to see which engine is active.
