import { z, type ZodTypeAny } from "zod";

export const MUTATION_TYPES = [
	"NONE",
	"TYPE_SWAP",
	"KEY_OMISSION",
	"BOUNDARY_OVERFLOW",
	"SEMANTIC_DRIFT",
] as const;
export type MutationType = (typeof MUTATION_TYPES)[number];

export const FUZZER_MODES = ["heuristic", "semantic"] as const;
export type FuzzerMode = (typeof FUZZER_MODES)[number];

export type AgentId =
	| "extractor"
	| "synthesizer"
	| "decision-engine"
	| "audit-logger";

export interface AgentDef {
	id: AgentId;
	name: string;
	role: string;
}

export const AGENTS: readonly AgentDef[] = [
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

const Decision = z.enum(["APPROVE", "REJECT"]);

export const ExtractionContract = z
	.object({
		claim_id: z.string().min(1),
		fields: z.array(z.string()).nonempty(),
		confidence: z.number().min(0).max(1),
	})
	.strict();

export const SynthesisContract = z
	.object({
		confidence: z.number().min(0).max(1),
		decision: Decision,
		risk_score: z.number().int(),
	})
	.strict();

export const AuditContract = z
	.object({
		claim_id: z.string().min(1),
		decision: Decision,
		risk_score: z.number().int(),
		signed: z.boolean(),
	})
	.strict();

export interface EdgeDef {
	id: string;
	sourceNodeId: AgentId;
	targetNodeId: AgentId;
	label: string;
	schema: ZodTypeAny;
	contractHint: string;
	baseline: () => Record<string, unknown>;
}

export const EDGES: readonly EdgeDef[] = [
	{
		id: "extractor-synthesizer",
		sourceNodeId: "extractor",
		targetNodeId: "synthesizer",
		label: "Extractor → Synthesizer",
		schema: ExtractionContract,
		contractHint:
			"claim_id: non-empty string; fields: non-empty string[]; confidence: number 0..1",
		baseline: () => ({
			claim_id: "CLM-20418",
			fields: ["invoice_total", "vendor", "due_date"],
			confidence: 0.94,
		}),
	},
	{
		id: "synthesizer-decision-engine",
		sourceNodeId: "synthesizer",
		targetNodeId: "decision-engine",
		label: "Synthesizer → Decision Engine",
		schema: SynthesisContract,
		contractHint:
			'confidence: number 0..1; decision: "APPROVE" | "REJECT"; risk_score: integer; no other keys',
		baseline: () => ({
			confidence: 0.91,
			decision: "APPROVE",
			risk_score: 72,
		}),
	},
	{
		id: "decision-engine-audit-logger",
		sourceNodeId: "decision-engine",
		targetNodeId: "audit-logger",
		label: "Decision Engine → Audit Logger",
		schema: AuditContract,
		contractHint:
			'claim_id: non-empty string; decision: "APPROVE" | "REJECT"; risk_score: integer; signed: boolean; no other keys',
		baseline: () => ({
			claim_id: "CLM-20418",
			decision: "APPROVE",
			risk_score: 72,
			signed: true,
		}),
	},
];

export function getEdge(edgeId: string): EdgeDef | undefined {
	return EDGES.find((e) => e.id === edgeId);
}

export interface ContractViolation {
	path: string;
	code: string;
	message: string;
}

export function toViolations(
	issues: readonly z.ZodIssue[],
): ContractViolation[] {
	return issues.map((i) => ({
		path: i.path.join(".") || "(root)",
		code: i.code,
		message: i.message,
	}));
}
