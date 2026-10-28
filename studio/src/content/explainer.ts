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
		a: "A three-hand-off sample claims workflow (extract, synthesize, decide, audit) ships with the studio so you can see every verdict type. External agents can report real payloads to the gateway for contract validation.",
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
		a: "Access is limited to an allowlist of GitHub accounts. You sign in with GitHub; the studio only reads your public profile.",
	},
	{
		q: "What do you store?",
		a: "Test runs and traces (including the payloads they contain), and a record of the Terms version you accepted. See the Privacy Policy for details.",
	},
];
