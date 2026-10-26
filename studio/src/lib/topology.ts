import type { AgentInfo, EdgeInfo } from "../types";

// Fixed agent DAG; mirrors AGENTS and EDGES in gateway/src/contracts/schemas.ts (the gateway exposes no topology route).
export const AGENTS: Omit<AgentInfo, "lastLatencyMs">[] = [
	{
		id: "extractor",
		name: "Extractor",
		role: "Parses invoice text into JSON",
	},
	{
		id: "synthesizer",
		name: "Synthesizer",
		role: "Merges extracted fields",
	},
	{
		id: "decision-engine",
		name: "Decision Engine",
		role: "Approves or rejects the claim",
	},
	{
		id: "audit-logger",
		name: "Audit Logger",
		role: "Writes the signed audit record",
	},
];

export const EDGES: EdgeInfo[] = [
	{
		id: "extractor-synthesizer",
		source: "extractor",
		target: "synthesizer",
		label: "Extractor → Synthesizer",
		contractFields: [
			{ field: "claim_id", expected: "non-empty string" },
			{ field: "fields", expected: "string[] (non-empty)" },
			{ field: "confidence", expected: "number 0..1" },
		],
	},
	{
		id: "synthesizer-decision-engine",
		source: "synthesizer",
		target: "decision-engine",
		label: "Synthesizer → Decision Engine",
		contractFields: [
			{ field: "confidence", expected: "number 0..1" },
			{
				field: "decision",
				expected: '"APPROVE" or "REJECT"',
			},
			{ field: "risk_score", expected: "integer" },
		],
	},
	{
		id: "decision-engine-audit-logger",
		source: "decision-engine",
		target: "audit-logger",
		label: "Decision Engine → Audit Logger",
		contractFields: [
			{ field: "claim_id", expected: "non-empty string" },
			{
				field: "decision",
				expected: '"APPROVE" or "REJECT"',
			},
			{ field: "risk_score", expected: "integer" },
			{ field: "signed", expected: "boolean" },
		],
	},
];
