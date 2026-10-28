import { AGENTS, EDGES } from "./schemas.js";

export const DEMO_PROJECT_ID = "demo";
export const DEMO_OWNER = "system";

const decision = { type: "string", enum: ["APPROVE", "REJECT"] };
const claimId = { type: "string", minLength: 1 };
const confidence = { type: "number", minimum: 0, maximum: 1 };

// Mirrors the Zod contracts in schemas.ts, which the sample agents still use directly.
const SCHEMAS: Record<string, unknown> = {
	"extractor-synthesizer": {
		type: "object",
		properties: {
			claim_id: claimId,
			fields: {
				type: "array",
				items: { type: "string" },
				minItems: 1,
			},
			confidence,
		},
		required: ["claim_id", "fields", "confidence"],
		additionalProperties: false,
	},
	"synthesizer-decision-engine": {
		type: "object",
		properties: {
			confidence,
			decision,
			risk_score: { type: "integer" },
		},
		required: ["confidence", "decision", "risk_score"],
		additionalProperties: false,
	},
	"decision-engine-audit-logger": {
		type: "object",
		properties: {
			claim_id: claimId,
			decision,
			risk_score: { type: "integer" },
			signed: { type: "boolean" },
		},
		required: ["claim_id", "decision", "risk_score", "signed"],
		additionalProperties: false,
	},
};

export const DEMO_AGENTS = AGENTS.map((a) => ({
	id: a.id,
	name: a.name,
	role: a.role,
}));

export const DEMO_EDGES = EDGES.map((e) => ({
	id: e.id,
	source: e.sourceNodeId,
	target: e.targetNodeId,
	label: e.label,
	schema: SCHEMAS[e.id],
	contractHint: e.contractHint,
	baseline: e.baseline(),
}));
