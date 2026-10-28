// Shared by the landing page and the How it works page so the two never drift apart.

export interface MutationInfo {
	type: string;
	title: string;
	what: string;
	why: string;
}

export const MUTATIONS: MutationInfo[] = [
	{
		type: "TYPE_SWAP",
		title: "Type swap",
		what: "A field changes type: a number becomes a string, a string becomes 404, a boolean becomes 0 or 1.",
		why: "Agents that assume a field's type without checking it crash or silently coerce.",
	},
	{
		type: "KEY_OMISSION",
		title: "Key omission",
		what: "A required key is deleted from the payload.",
		why: "Finds agents that read a field without guarding against it being absent.",
	},
	{
		type: "BOUNDARY_OVERFLOW",
		title: "Boundary overflow",
		what: "A field is replaced with a number beyond the safe integer range (about 2^53).",
		why: "Exposes range assumptions and contracts that check the type but not the bounds.",
	},
	{
		type: "SEMANTIC_DRIFT",
		title: "Semantic drift",
		what: "Values keep a valid shape but change meaning: hedged prose instead of a number, an inverted decision, extra fields.",
		why: "The failure mode that matters most for LLM-driven agents, and the one schemas rarely catch.",
	},
];

export interface VerdictInfo {
	label: string;
	color: "success" | "warning" | "danger" | "informative";
	meaning: string;
}

export const VERDICTS: VerdictInfo[] = [
	{
		label: "Handled",
		color: "success",
		meaning: "The payload was valid and the downstream agent processed it.",
	},
	{
		label: "Recovered",
		color: "warning",
		meaning: "The contract was violated, but the downstream agent coped and did not crash.",
	},
	{
		label: "Bypassed",
		color: "informative",
		meaning: "A mutation was applied, yet the payload still satisfied the contract: a gap in the contract.",
	},
	{
		label: "Breach",
		color: "danger",
		meaning: "The downstream agent threw an error and the hand-off failed.",
	},
];

export interface EdgeRow {
	edge: string;
	contract: string;
}

export const SAMPLE_EDGES: EdgeRow[] = [
	{
		edge: "Extractor → Synthesizer",
		contract: "claim_id: non-empty string · fields: non-empty string[] · confidence: number 0..1",
	},
	{
		edge: "Synthesizer → Decision Engine",
		contract: 'confidence: number 0..1 · decision: "APPROVE" | "REJECT" · risk_score: integer',
	},
	{
		edge: "Decision Engine → Audit Logger",
		contract: 'claim_id: non-empty string · decision: "APPROVE" | "REJECT" · risk_score: integer · signed: boolean',
	},
];

export interface Example {
	title: string;
	edge: string;
	mutation: string;
	delivered: string;
	contract: string;
	agent: string;
	verdict: VerdictInfo;
}

export const EXAMPLES: Example[] = [
	{
		title: "A swapped type crashes the agent",
		edge: "Synthesizer → Decision Engine",
		mutation: "TYPE_SWAP on decision",
		delivered: '{\n  "confidence": 0.91,\n  "decision": 404,\n  "risk_score": 72\n}',
		contract: 'Violated: decision must be "APPROVE" or "REJECT"',
		agent: "Decision Engine throws a TypeError it never handles",
		verdict: VERDICTS[3],
	},
	{
		title: "A missing field is absorbed",
		edge: "Synthesizer → Decision Engine",
		mutation: "KEY_OMISSION on risk_score",
		delivered: '{\n  "confidence": 0.91,\n  "decision": "APPROVE"\n}',
		contract: "Violated: risk_score is required",
		agent: "Decision Engine falls back to manual review",
		verdict: VERDICTS[1],
	},
	{
		title: "A valid-looking change slips through",
		edge: "Decision Engine → Audit Logger",
		mutation: "SEMANTIC_DRIFT on claim_id",
		delivered: '{\n  "claim_id": "[Ambiguous status] CLM-20418 (eval: unknown)",\n  "decision": "APPROVE",\n  "risk_score": 72,\n  "signed": true\n}',
		contract: "Satisfied: any non-empty string is a valid claim_id",
		agent: "Audit Logger records the corrupted identifier",
		verdict: VERDICTS[2],
	},
];

export const OWN_AGENT_STEPS: { title: string; body: string }[] = [
	{
		title: "Add the MCP server",
		body: "Add a small local MCP server to your editor. It works with VS Code, Claude Desktop, Cursor and other MCP clients.",
	},
	{
		title: "Sign in with GitHub",
		body: "Your assistant shows a link and a code. You approve them here, and the server stores a revocable token in your home folder.",
	},
	{
		title: "Define contracts",
		body: "The assistant finds your agents, drafts a JSON Schema for each hand-off from sample payloads, and saves them to a .mml folder in your repository.",
	},
	{
		title: "Run and review",
		body: "The assistant sends each case to your real agents and reports the outcome. Results appear in your private project here, live.",
	},
];

export interface FaqItem {
	q: string;
	a: string;
}

export const FAQ: FaqItem[] = [
	{
		q: "Does it change my agents?",
		a: "No. The interceptor wraps the call between two agents and corrupts only the payload in transit. Your agents and their data stores are untouched.",
	},
	{
		q: "What workflow does the studio test?",
		a: "A built-in claims workflow (extract, synthesize, decide, audit) lets you see every verdict type straight away. To test your own agents, connect your AI assistant through the MCP server and define contracts for your own hand-offs.",
	},
	{
		q: "Does the MCP server run my code?",
		a: "No. Your assistant calls your agents with the payloads Contract Tester prepares, and reports what happened. The MCP server only talks to your assistant and to the gateway, and writes a .mml folder with non-secret context to your workspace.",
	},
	{
		q: "Where is my sign-in token kept?",
		a: "In ~/.mml/credentials.json in your home folder, readable only by you, never in the workspace. You can see and revoke every connected tool on your account page.",
	},
	{
		q: "What is the difference between heuristic and semantic mode?",
		a: "Heuristic mode applies deterministic mutations in-process. Semantic mode asks a fuzzer service, backed by a local language model or a deterministic mock, to rewrite values in plausible but wrong ways. If the service is unavailable it falls back to heuristic.",
	},
	{
		q: "Can I reproduce a run?",
		a: "Yes. Every run stores a seed. Starting a heuristic run with the same seed repeats the same mutations.",
	},
	{
		q: "Who can sign in?",
		a: "Anyone with a GitHub account. You sign in with GitHub; the studio only reads your public profile. Your projects, runs and results are visible only to you.",
	},
	{
		q: "What do you store?",
		a: "Test runs and traces (including the payloads they contain), and a record of the Terms version you accepted. See the Privacy Policy for details.",
	},
];
