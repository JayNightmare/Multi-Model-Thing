export type Row = Record<string, unknown>;

/** Serialised access to the single DuckDB connection. */
export interface Db {
	exec(sql: string, params?: unknown[]): Promise<void>;
	query(sql: string, params?: unknown[]): Promise<Row[]>;
	/** Runs several statements back to back so no other statement interleaves. */
	batch(
		fn: (
			run: (sql: string, params?: unknown[]) => Promise<void>,
		) => Promise<void>,
	): Promise<void>;
}

export const ISO = "'%Y-%m-%dT%H:%M:%S.%gZ'";
