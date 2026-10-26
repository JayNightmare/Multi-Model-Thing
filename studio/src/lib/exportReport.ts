import type { RunMetrics, TraceRecord } from "../types";

export interface ReportOptions {
	title: string;
	notes: string;
	includeDiffs: boolean;
	strategies: string[];
	metrics: RunMetrics;
	traces: TraceRecord[];
}

// Serialised data is embedded in a <script>; "<" is escaped so payload text can never close the tag.
function embed(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/\u2028|\u2029/g, "");
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function buildReportHtml(options: ReportOptions): string {
	const { title, notes, includeDiffs, strategies, metrics, traces } =
		options;
	const generatedAt = new Date().toISOString();
	const data = embed({ metrics, includeDiffs, traces });

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#0b1120;--card:#111a2e;--border:#1e293b;--accent:#38bdf8;--text:#e2e8f0;--muted:#94a3b8;--success:#22c55e;--amber:#f59e0b;--danger:#ef4444}
*{box-sizing:border-box;margin:0;padding:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
body{background:var(--bg);color:var(--text);padding:2rem;font-size:13px}
header{margin-bottom:2rem;border-bottom:1px solid var(--border);padding-bottom:1.5rem}
h1{font-size:1.5rem}
.meta{color:var(--muted);margin-top:.5rem;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.stat{background:var(--card);border:1px solid var(--border);padding:1.25rem;border-radius:6px}
.stat-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.stat-val{font-size:1.75rem;font-weight:700;margin-top:.25rem}
.toolbar{display:flex;gap:.5rem;margin-bottom:1rem}
.toolbar button{background:var(--card);color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:.4rem .8rem;cursor:pointer}
.toolbar button.active{color:var(--accent);border-color:var(--accent)}
.wrap{background:var(--card);border:1px solid var(--border);border-radius:6px;overflow:hidden}
table{width:100%;border-collapse:collapse;text-align:left}
th,td{padding:.75rem 1rem;border-bottom:1px solid var(--border)}
th{background:#16223a;color:var(--muted);font-size:11px}
tr.row:hover{background:rgba(255,255,255,.03);cursor:pointer}
.badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700}
.ok{background:rgba(34,197,94,.15);color:var(--success)}
.warn{background:rgba(245,158,11,.15);color:var(--amber)}
.bad{background:rgba(239,68,68,.15);color:var(--danger)}
.details{display:none;background:#080c14;padding:1rem}
.details.open{display:block}
.diff{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:.5rem}
pre{background:#030712;padding:.75rem;border-radius:6px;overflow-x:auto;font-size:11px;border:1px solid var(--card)}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(title)}</h1>
<div class="meta">Run: <strong>${escapeHtml(metrics.runId || "Manual export")}</strong> | Generated: ${escapeHtml(generatedAt)}<br>Strategies: ${escapeHtml(strategies.join(", ") || "n/a")}${notes ? `<br>Notes: ${escapeHtml(notes)}` : ""}</div>
</header>
<div class="grid">
<div class="stat"><div class="stat-label">Contracts Checked</div><div class="stat-val">${metrics.contractsChecked}</div></div>
<div class="stat"><div class="stat-label">Recovery Rate</div><div class="stat-val" style="color:${metrics.recoveryRate >= 80 ? "var(--success)" : "var(--danger)"}">${metrics.recoveryRate}%</div></div>
<div class="stat"><div class="stat-label">Contract Breaches</div><div class="stat-val" style="color:${metrics.breaches > 0 ? "var(--danger)" : "var(--text)"}">${metrics.breaches}</div></div>
<div class="stat"><div class="stat-label">Avg Latency</div><div class="stat-val">${metrics.avgLatencyMs} ms</div></div>
</div>
<div class="toolbar" id="filters"></div>
<div class="wrap"><table>
<thead><tr><th>Trace</th><th>Edge</th><th>Mutation</th><th>Contract</th><th>Downstream</th><th>Latency</th></tr></thead>
<tbody id="rows"></tbody>
</table></div>
<script>
const report = ${data};
const rows = document.getElementById('rows');
const filters = document.getElementById('filters');
const FILTERS = { All: () => true, Violations: (t) => t.contractViolated, Breaches: (t) => t.downstreamStatus === 'FAILED' };

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  (children || []).forEach((c) => node.append(c));
  return node;
}
function status(t) {
  if (t.downstreamStatus === 'FAILED') return ['CRASH / UNHANDLED', 'bad'];
  if (t.contractViolated) return ['RECOVERED', 'warn'];
  return ['CONTRACT INTACT', 'ok'];
}
function render(filterName) {
  rows.replaceChildren();
  report.traces.filter(FILTERS[filterName]).forEach((t) => {
    const [label, cls] = status(t);
    const tr = el('tr', { className: 'row' }, [
      el('td', { textContent: t.traceId.slice(0, 8) + '…' }),
      el('td', { textContent: t.sourceNodeId + ' → ' + t.targetNodeId }),
      el('td', { textContent: t.strategy || t.mutationType }),
      el('td', { textContent: t.contractViolated ? 'Violated' : 'Valid' }),
      el('td', {}, [el('span', { className: 'badge ' + cls, textContent: label })]),
      el('td', { textContent: t.durationMs + ' ms' }),
    ]);
    rows.append(tr);
    if (report.includeDiffs) {
      const body = [];
      if (t.caughtError) body.push(el('div', { textContent: 'Error: ' + t.caughtError }));
      body.push(el('div', { className: 'diff' }, [
        el('div', {}, [el('strong', { textContent: 'Original payload' }), el('pre', { textContent: JSON.stringify(t.originalPayload, null, 2) })]),
        el('div', {}, [el('strong', { textContent: 'Delivered payload' }), el('pre', { textContent: JSON.stringify(t.perturbedPayload, null, 2) })]),
      ]));
      const details = el('div', { className: 'details' }, body);
      rows.append(el('tr', {}, [el('td', { colSpan: 6, style: 'padding:0' }, [details])]));
      tr.addEventListener('click', () => details.classList.toggle('open'));
    }
  });
}
Object.keys(FILTERS).forEach((name, i) => {
  const btn = el('button', { textContent: name, className: i === 0 ? 'active' : '' });
  btn.addEventListener('click', () => {
    filters.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render(name);
  });
  filters.append(btn);
});
render('All');
</script>
</body>
</html>`;
}

export function exportHtmlReport(options: ReportOptions): void {
	const blob = new Blob([buildReportHtml(options)], {
		type: "text/html;charset=utf-8",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `adversarial-report-${options.metrics.runId || Date.now()}.html`;
	anchor.click();
	URL.revokeObjectURL(url);
}
