type Json = Record<string, unknown>;

type Kind =
	| "null"
	| "boolean"
	| "integer"
	| "number"
	| "string"
	| "array"
	| "object";

function kindOf(value: unknown): Kind {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	switch (typeof value) {
		case "boolean":
			return "boolean";
		case "number":
			return Number.isInteger(value) ? "integer" : "number";
		case "string":
			return "string";
		default:
			return "object";
	}
}

function merge(values: unknown[]): Json {
	const kinds = new Set(values.map(kindOf));
	// An integer sample alongside a decimal one still means "number".
	if (kinds.has("integer") && kinds.has("number"))
		kinds.delete("integer");
	const types = [...kinds].sort();
	if (types.length !== 1) return { type: types };

	const kind = types[0];
	if (kind === "string") {
		return values.every((v) => (v as string).length > 0)
			? { type: "string", minLength: 1 }
			: { type: "string" };
	}
	if (kind === "array") {
		const arrays = values as unknown[][];
		const items = arrays.flat();
		return {
			type: "array",
			items: items.length > 0 ? merge(items) : {},
			...(arrays.every((a) => a.length > 0)
				? { minItems: 1 }
				: {}),
		};
	}
	if (kind === "object") {
		const objects = values as Json[];
		const keys = [
			...new Set(objects.flatMap((o) => Object.keys(o))),
		];
		return {
			type: "object",
			properties: Object.fromEntries(
				keys.map((k) => [
					k,
					merge(
						objects
							.filter((o) => k in o)
							.map((o) => o[k]),
					),
				]),
			),
			required: keys.filter((k) =>
				objects.every((o) => k in o),
			),
			additionalProperties: false,
		};
	}
	return { type: kind };
}

/**
 * Drafts a strict JSON Schema from example payloads: types are observed, keys seen in every
 * sample are required, and extra keys are forbidden. It is a starting point to review.
 */
export function inferSchema(samples: unknown[]): Json {
	if (samples.length === 0)
		throw new Error("Provide at least one sample payload");
	if (!samples.every((s) => kindOf(s) === "object")) {
		throw new Error("Every sample must be a JSON object");
	}
	return merge(samples);
}
