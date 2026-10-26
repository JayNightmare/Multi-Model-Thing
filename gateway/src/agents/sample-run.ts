import type {
	AgentHandler,
	ContractProxyInterceptor,
} from "../contracts/interceptor.js";
import {
	EDGES,
	type EdgeDef,
	type MutationType,
} from "../contracts/schemas.js";

type Payload = Record<string, unknown>;

// Defensive agent: detects a bad upstream payload and recovers with a typed fallback.
const synthesizer: AgentHandler<Payload, Payload> = async (input) => {
	if (
		typeof input.confidence !== "number" ||
		!Array.isArray(input.fields)
	) {
		return {
			recovered: true,
			reason: "invalid extraction payload; routed to manual review",
		};
	}
	return {
		confidence: input.confidence,
		decision: "APPROVE",
		risk_score: Math.round(input.confidence * 85.5),
	};
};

// Partially defensive agent: crashes on an unrecognised decision, tolerates other drift.
const decisionEngine: AgentHandler<Payload, Payload> = async (input) => {
	if (input.decision !== "APPROVE" && input.decision !== "REJECT") {
		throw new TypeError(
			`Decision Engine cannot interpret decision "${String(input.decision)}"`,
		);
	}
	if (typeof input.risk_score !== "number") {
		return {
			recovered: true,
			reason: "missing risk score; defaulted to manual review",
		};
	}
	return {
		claim_id: "CLM-20418",
		decision: input.decision,
		risk_score: input.risk_score,
		signed: true,
	};
};

// Fragile agent: assumes every invariant holds.
const auditLogger: AgentHandler<Payload, Payload> = async (input) => {
	if (
		typeof input.claim_id !== "string" ||
		typeof input.signed !== "boolean" ||
		typeof input.risk_score !== "number"
	) {
		throw new TypeError(
			"Contract Breached: Audit Logger encountered invalid internal invariants",
		);
	}
	return { logged: true, claim_id: input.claim_id };
};

const HANDLERS: Record<string, AgentHandler<Payload, Payload>> = {
	"extractor-synthesizer": synthesizer,
	"synthesizer-decision-engine": decisionEngine,
	"decision-engine-audit-logger": auditLogger,
};

export interface SampleRunOptions {
	runId: string;
	edgeId?: string;
	mutations: MutationType[];
}

function createProxy(
	interceptor: ContractProxyInterceptor,
	edge: EdgeDef,
	runId: string,
	mutation?: MutationType,
) {
	return interceptor.createEdgeProxy({
		runId,
		edgeId: edge.id,
		sourceNodeId: edge.sourceNodeId,
		targetNodeId: edge.targetNodeId,
		schema: edge.schema,
		contractHint: edge.contractHint,
		targetAgent: HANDLERS[edge.id],
		enableAdversarialMutation: mutation !== undefined,
		forcedMutationType: mutation,
	});
}

// Each edge is exercised independently: one baseline delivery, then one delivery per mutation.
export async function executeSampleRun(
	interceptor: ContractProxyInterceptor,
	options: SampleRunOptions,
): Promise<void> {
	const edges = EDGES.filter(
		(e) => options.edgeId === undefined || e.id === options.edgeId,
	);

	for (const edge of edges) {
		for (const mutation of [undefined, ...options.mutations]) {
			const send = createProxy(
				interceptor,
				edge,
				options.runId,
				mutation,
			);
			try {
				await send(edge.baseline());
			} catch {
				// Downstream fault is recorded on the trace by the interceptor.
			}
		}
	}
}
