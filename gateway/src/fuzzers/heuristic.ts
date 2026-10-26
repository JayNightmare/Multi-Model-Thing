import type { ZodTypeAny } from "zod";
import type { FuzzerEngine, PerturbResult } from "../contracts/interceptor.js";
import type { MutationType } from "../contracts/schemas.js";

const MUTATIONS: Exclude<MutationType, "NONE">[] = [
	"TYPE_SWAP",
	"KEY_OMISSION",
	"BOUNDARY_OVERFLOW",
	"SEMANTIC_DRIFT",
];

export class HeuristicFuzzer implements FuzzerEngine {
	constructor(private readonly random: () => number = Math.random) {}

	async perturb(
		payload: unknown,
		_schema: ZodTypeAny,
		preferredMutation?: MutationType,
	): Promise<PerturbResult> {
		if (
			typeof payload !== "object" ||
			payload === null ||
			Array.isArray(payload)
		) {
			return {
				mutatedPayload: payload,
				mutationType: "NONE",
				strategy: "HEURISTIC",
			};
		}

		const copy = JSON.parse(JSON.stringify(payload)) as Record<
			string,
			unknown
		>;
		const keys = Object.keys(copy);
		if (keys.length === 0) {
			return {
				mutatedPayload: copy,
				mutationType: "NONE",
				strategy: "HEURISTIC",
			};
		}

		const targetKey = keys[Math.floor(this.random() * keys.length)];
		const chosenType =
			preferredMutation && preferredMutation !== "NONE"
				? preferredMutation
				: this.selectRandomMutation();

		switch (chosenType) {
			case "KEY_OMISSION":
				delete copy[targetKey];
				break;

			case "TYPE_SWAP": {
				const current = copy[targetKey];
				if (typeof current === "number")
					copy[targetKey] = String(current);
				else if (typeof current === "string")
					copy[targetKey] = 404;
				else if (typeof current === "boolean")
					copy[targetKey] = current ? 0 : 1;
				else copy[targetKey] = null;
				break;
			}

			case "BOUNDARY_OVERFLOW":
				copy[targetKey] =
					Number.MAX_SAFE_INTEGER + 1000;
				break;

			case "SEMANTIC_DRIFT":
				if (typeof copy[targetKey] === "string") {
					copy[targetKey] =
						`[Ambiguous status] ${copy[targetKey]} (eval: unknown)`;
				}
				break;

			default:
				break;
		}

		return {
			mutatedPayload: copy,
			mutationType: chosenType,
			strategy: "HEURISTIC",
		};
	}

	private selectRandomMutation(): MutationType {
		return MUTATIONS[Math.floor(this.random() * MUTATIONS.length)];
	}
}
