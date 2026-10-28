# Math and Metrics

All formulas in the project, with the code that implements them. Notation: for an edge, let

- $n$ = traces, $p$ = passed (no violation), $v$ = violations, $b$ = breaches (`downstreamStatus = FAILED`),
- $r$ = recovered = violations whose downstream status is not `FAILED`.

## Per-edge counters

$$
p = n - v \qquad v = |\{t : \text{contractViolated}(t)\}| \qquad r = |\{t : \text{contractViolated}(t) \wedge \text{status}(t) \neq \text{FAILED}\}|
$$

$$
b = |\{t : \text{status}(t) = \text{FAILED}\}|
$$

Because a baseline trace can crash an agent without violating the contract, $b$ can include traces that are not in $v$. When every failure follows a violation (true for the sample agents), $v = r + b$.

Code: `summarizeTraces` (`studio/src/lib/metrics.ts`) and the SQL in `DuckDbTraceStore.listRuns`.

## Edge health

$$
\text{health}(b, v) =
\begin{cases}
\text{red (Failing)} & b > 0 \\
\text{amber (Degraded)} & b = 0 \wedge v > 0 \\
\text{green (Healthy)} & b = 0 \wedge v = 0
\end{cases}
$$

Breaches dominate violations. An agent's status follows the worst health among edges that target it. `classifyEdgeHealth` exists in both the gateway and the studio and must stay identical.

## Recovery rate

The project uses one definition everywhere (studio live metrics, `computeMetrics`, `metricsFromTraces`, and the persisted run summary in `DuckDbTraceStore.completeRun`): of the contract violations, the share the downstream agent survived.

$$
R = \begin{cases} 100 & v = 0 \\ \dfrac{\lfloor 1000\, r / v \rceil}{10} & v > 0 \end{cases}
$$

where $\lfloor\cdot\rceil$ is rounding to the nearest integer, giving one decimal place. A run with no violations scores 100%.

Why this definition: recovery is only meaningful when something went wrong. `BYPASSED` mutations (the payload still satisfied the contract) say nothing about the agent's resilience, and baseline traces are not attacks, so neither belongs in the denominator or numerator. Earlier versions divided by applied mutations in the stored summary; migration `002_seed_and_recovery` recomputed every completed run with the formula above.

## Average latency

$$
\bar{L} = \left\lfloor \frac{1}{N}\sum_{i=1}^{N} d_i \right\rceil \text{ ms}
$$

over the live run's traces when there are any, otherwise over each agent's last known latency, and 0 for an empty set. Each $d_i$ is measured with `performance.now()` around fuzz, validation and the agent call, rounded to hundredths: $d_i = \lfloor 100\,\Delta t \rceil / 100$. Ingested traces have $d = 0$.

## Run sizes

For $e$ selected edges and $k$ mutations per mode (heuristic $k=4$, semantic $k=3$):

$$
\text{traces} = e\,(1 + k) \qquad \text{mutated traces} = e\,k
$$

A full run ($e = 3$) is 15 traces (12 mutated) in heuristic mode and 12 traces (9 mutated) in semantic mode.

## Heuristic fuzzer probabilities

With $K$ the number of keys in the payload and $U \sim \text{Uniform}[0,1)$, the mutated key index is $\lfloor U K \rfloor$, so each key is chosen with probability $1/K$. If no mutation is forced it is chosen uniformly from four, each with probability $1/4$ (runs always force one).

`BOUNDARY_OVERFLOW` writes $2^{53}-1+1000 \approx 9.007 \times 10^{15}$. This satisfies `z.number().int()` (it is an integer) but violates any bounded or non-numeric field, so on an edge it violates the contract only when the chosen key is not an unbounded integer field.

## Expected outcomes of the sample run

Assuming heuristic mode and uniform key choice, the contract and the sample agents give the following per-mutation probabilities. $P_v$ is the probability the contract is violated; $P_b$ the probability the downstream agent throws.

| Edge | Mutation | $P_v$ | $P_b$ | Why |
| --- | --- | --- | --- | --- |
| extractor → synthesizer | `KEY_OMISSION` | 1 | 0 | all keys required; agent never throws |
| | `TYPE_SWAP` | 1 | 0 | every swap changes the type |
| | `BOUNDARY_OVERFLOW` | 1 | 0 | no key is an unbounded integer |
| | `SEMANTIC_DRIFT` | 0 | 0 | only `claim_id` is a string and a prefixed string is still non-empty: `BYPASSED` |
| synthesizer → decision-engine | `KEY_OMISSION` | 1 | 1/3 | throws only if `decision` is the key |
| | `TYPE_SWAP` | 1 | 1/3 | same |
| | `BOUNDARY_OVERFLOW` | 2/3 | 1/3 | `risk_score` stays a valid integer; `decision` hit throws |
| | `SEMANTIC_DRIFT` | 1/3 | 1/3 | only `decision` is a string; hit violates and throws |
| decision-engine → audit-logger | `KEY_OMISSION` | 1 | 3/4 | omitting `decision` does not throw |
| | `TYPE_SWAP` | 1 | 3/4 | swapping `decision` does not throw |
| | `BOUNDARY_OVERFLOW` | 3/4 | 1/2 | `risk_score` stays numeric and valid |
| | `SEMANTIC_DRIFT` | 1/4 | 0 | `claim_id` drift stays valid; `decision` drift violates but is ignored |

Summing over the 12 mutated traces of a full heuristic run:

$$
E[v] = 3 + 3 + 3 = 9 \qquad E[b] = 0 + \tfrac{4}{3} + 2 = \tfrac{10}{3} \approx 3.33
$$

so on average $E[r] = E[v] - E[b] = 17/3 \approx 5.67$. Approximating the rate by the ratio of expectations:

$$
R \approx \frac{17/3}{9} \approx 63\%
$$

This is the number to expect from many heuristic runs; any single run varies because the key choice is random (but see [Seeded replay](#seeded-replay)). Semantic mode and the LLM engine are not modelled here.

## Seeded replay

Each run has a seed string (default: the run id). The heuristic fuzzer's uniform draws $U$ come from a deterministic generator:

1. **FNV-1a** hashes the seed to a 32-bit state: $h_0 = 2166136261$, then for each UTF-16 code unit $c$: $h \leftarrow (h \oplus c) \cdot 16777619 \bmod 2^{32}$.
2. **mulberry32** advances $a \leftarrow a + \text{0x6D2B79F5} \bmod 2^{32}$ and mixes the bits to a 32-bit integer $z$; the draw is $U = z / 2^{32} \in [0,1)$.

The same seed therefore yields the same sequence of key choices, so the same mutated payloads. mulberry32 is a statistical PRNG, not a cryptographic one; seeds are not secrets.

## Mock fuzzer functions

For `AMBIGUOUS_DRIFT` on a float $x \in [0,1]$:

$$
h(x) = \begin{cases} \text{"very high"} & x \ge 0.8 \\ \text{"moderate"} & 0.4 \le x < 0.8 \\ \text{"low"} & x < 0.4 \end{cases}
$$

Other numbers become `"roughly "` plus $\text{round}(x, -1)$ if $|x| \ge 10$, else $\text{round}(x)$, with banker's rounding (ties go to the even neighbour, e.g. $85 \to 80$). `INVERT_LOGIC` negates numbers ($x \mapsto -x$) and booleans.

## Sample agent scoring

The synthesizer sets $\text{risk\_score} = \lfloor 85.5\,c \rceil$ for confidence $c$, so $c \in [0,1]$ gives a score in $[0, 86]$ (JavaScript `Math.round` rounds ties up). The baseline extractor confidence 0.94 yields $\lfloor 80.37 \rceil = 80$.

## LLM sampling temperature

For logits $z_i$ and temperature $\tau$ (request range $[0, 1.5]$, default 0.7), token probabilities are

$$
p_i = \frac{e^{z_i/\tau}}{\sum_j e^{z_j/\tau}}
$$

Lower $\tau$ concentrates mass on the highest logit (as $\tau \to 0$ the choice becomes greedy); higher $\tau$ flattens the distribution and produces more varied, riskier mutations. Output is capped at 1024 tokens within a 4096-token context.

## Reconnect backoff

The studio's WebSocket delay starts at $d_0 = 1000$ ms, and on each disconnect

$$
d_{k+1} = \min(1.5\, d_k,\ 10\,000)
$$

and the reconnect waits $d_{k+1}$. The waits are 1500, 2250, 3375, 5062.5, 7593.75, then 10 000 ms thereafter. A successful open resets $d$ to 1000.

## Authentication arithmetic

- **JWT:** HS256 is HMAC-SHA-256 with the shared secret. API tokens expire after `JWT_TTL_SECONDS` (default 3600, minimum 60); telemetry tickets after 30 s; OAuth state tokens after 10 min; GitHub login codes after 60 s and are single-use.
- **Secret strength:** the gateway requires at least 32 characters. `openssl rand -hex 32` yields 64 hex characters, i.e. 256 bits of entropy.
- **OAuth codes:** a login code is 32 random bytes (256 bits, base64url), so guessing one is infeasible; failed exchanges also count toward the per-IP limit below.
- **Failure throttling (password login and code exchange):** at most 5 failed attempts per 60 s window per IP, so one IP can make at most 300 guesses per hour. For a password with $H$ bits of entropy, the expected time to guess it from one IP is about $2^{H-1}/5$ minutes. Many source IPs multiply the rate, so use a long random password or prefer GitHub sign-in.
- **Constant-time compare:** both inputs are hashed to 32 bytes with SHA-256 first, so `timingSafeEqual` always compares equal-length buffers and the comparison time does not leak the password length.

## Event deduplication

Event ids are `start-<runId>`, `done-<runId>` and `trace-<traceId>`. History and live events are concatenated and filtered so the first occurrence of each id is kept, so a trace seen both from storage and from the socket appears once.
