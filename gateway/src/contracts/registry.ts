import { createHash } from "node:crypto";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { AppError } from "../errors.js";
import type { ContractViolation } from "./schemas.js";

export const MAX_JSON_BYTES = 64 * 1024;
const MAX_CACHED = 1000;

export interface ContractField {
	field: string;
	expected: string;
}

type Json = Record<string, unknown>;

function newAjv(): Ajv {
	// Formats are ignored (no ajv-formats), and unknown keywords are rejected so typos surface early.
	return new Ajv({
		allErrors: true,
		strict: true,
		validateFormats: false,
		allowUnionTypes: true,
	});
}

function toViolation(e: ErrorObject): ContractViolation {
	const base = e.instancePath
		.split("/")
		.filter(Boolean)
		.map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
		.join(".");
	const extra =
		e.keyword === "required"
			? String(e.params.missingProperty)
			: e.keyword === "additionalProperties"
				? String(e.params.additionalProperty)
				: "";
	return {
		path: [base, extra].filter(Boolean).join(".") || "(root)",
		code: e.keyword,
		message: e.message ?? "invalid",
	};
}

export function jsonSize(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

export class ContractRegistry {
	private ajv = newAjv();
	private cache = new Map<string, ValidateFunction>();

	/** Throws a 422 AppError when the schema is not an acceptable contract. */
	assertValid(schema: unknown): void {
		this.compile(schema);
	}

	validate(schema: unknown, payload: unknown): ContractViolation[] {
		const fn = this.compile(schema);
		return fn(payload) ? [] : (fn.errors ?? []).map(toViolation);
	}

	private compile(schema: unknown): ValidateFunction {
		if (
			typeof schema !== "object" ||
			schema === null ||
			Array.isArray(schema) ||
			(schema as Json).type !== "object"
		) {
			throw invalid(
				'Contract must be a JSON Schema object with "type": "object"',
			);
		}
		if (jsonSize(schema) > MAX_JSON_BYTES) {
			throw invalid("Contract is larger than 64 KB");
		}
		// Dialect and id keys would make Ajv fetch or reject schemas; the registry owns identity.
		const { $schema: _s, $id: _i, ...clean } = schema as Json;
		const key = createHash("sha256")
			.update(JSON.stringify(clean))
			.digest("hex");
		const hit = this.cache.get(key);
		if (hit) return hit;
		if (this.cache.size >= MAX_CACHED) {
			this.cache.clear();
			this.ajv = newAjv();
		}
		try {
			const fn = this.ajv.compile(clean);
			this.cache.set(key, fn);
			return fn;
		} catch (err) {
			throw invalid(
				`Invalid contract: ${(err as Error).message}`,
			);
		}
	}
}

function invalid(message: string): AppError {
	return new AppError("VALIDATION_ERROR", message, 422);
}

function describeSchema(s: unknown): string {
	if (typeof s !== "object" || s === null) return "any";
	const o = s as Json;
	if (Array.isArray(o.enum))
		return o.enum.map((v) => JSON.stringify(v)).join(" or ");
	if (o.const !== undefined) return JSON.stringify(o.const);
	const type = o.type;
	if (Array.isArray(type)) return type.join(" or ");
	if (type === "string")
		return Number(o.minLength) >= 1 ? "non-empty string" : "string";
	if (type === "number" || type === "integer") {
		const min = o.minimum;
		const max = o.maximum;
		if (min !== undefined && max !== undefined)
			return `${type === "integer" ? "integer" : "number"} ${min}..${max}`;
		if (min !== undefined) return `${type} ≥ ${min}`;
		if (max !== undefined) return `${type} ≤ ${max}`;
		return type === "integer" ? "integer" : "number";
	}
	if (type === "array") {
		const item = describeSchema(o.items);
		return `${item === "any" ? "any" : item}[]${Number(o.minItems) >= 1 ? " (non-empty)" : ""}`;
	}
	return typeof type === "string" ? type : "any";
}

/** Human-readable field list the studio shows next to received payloads. */
export function describeContract(schema: unknown): ContractField[] {
	const root = (schema ?? {}) as Json;
	const props = (root.properties ?? {}) as Record<string, unknown>;
	const required = new Set(
		Array.isArray(root.required) ? (root.required as string[]) : [],
	);
	return Object.entries(props).map(([field, def]) => ({
		field,
		expected:
			describeSchema(def) +
			(required.has(field) ? "" : " (optional)"),
	}));
}
