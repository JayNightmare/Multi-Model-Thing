export type ErrorCode =
	| "VALIDATION_ERROR"
	| "UNKNOWN_EDGE"
	| "UNAUTHORIZED"
	| "RATE_LIMITED"
	| "NOT_FOUND"
	| "RUN_IN_PROGRESS"
	| "SERVICE_UNAVAILABLE"
	| "INTERNAL_ERROR";

export interface ErrorBody {
	error: { code: ErrorCode; message: string; details?: unknown };
}

export class AppError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly statusCode: number,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "AppError";
	}
}

export function errorBody(
	code: ErrorCode,
	message: string,
	details?: unknown,
): ErrorBody {
	return {
		error:
			details === undefined
				? { code, message }
				: { code, message, details },
	};
}
