import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { loadConfig } from "../config.js";

// Resolves to gateway/migrations from both src/storage and dist/storage.
const MIGRATIONS_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"migrations",
);

const UP = /^(\d+)_(.+)\.up\.sql$/;

interface Migration {
	version: string;
	name: string;
	file: string;
}

function listMigrations(dir: string): Migration[] {
	return readdirSync(dir)
		.map((file) => ({ file, match: UP.exec(file) }))
		.filter((m) => m.match !== null)
		.map((m) => ({
			version: m.match![1],
			name: m.match![2],
			file: m.file,
		}))
		.sort((a, b) => a.version.localeCompare(b.version));
}

const statements = (sql: string): string[] =>
	sql
		.split(";")
		.map((s) =>
			s
				.split("\n")
				.filter((line) => !line.trim().startsWith("--"))
				.join("\n")
				.trim(),
		)
		.filter(Boolean);

async function ensureLedger(conn: DuckDBConnection): Promise<void> {
	await conn.run(
		`CREATE TABLE IF NOT EXISTS schema_migrations (
       version VARCHAR PRIMARY KEY,
       name VARCHAR NOT NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
	);
}

async function appliedVersions(conn: DuckDBConnection): Promise<string[]> {
	const reader = await conn.runAndReadAll(
		"SELECT version FROM schema_migrations ORDER BY version",
	);
	return reader.getRowObjectsJson().map((r) => String(r.version));
}

/** Applies every pending *.up.sql migration in version order; returns the versions applied. */
export async function migrateUp(
	conn: DuckDBConnection,
	dir = MIGRATIONS_DIR,
): Promise<string[]> {
	await ensureLedger(conn);
	const done = new Set(await appliedVersions(conn));
	const applied: string[] = [];
	for (const m of listMigrations(dir)) {
		if (done.has(m.version)) continue;
		for (const stmt of statements(
			readFileSync(join(dir, m.file), "utf8"),
		)) {
			await conn.run(stmt);
		}
		await conn.run(
			"INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
			[m.version, m.name],
		);
		applied.push(m.version);
	}
	return applied;
}

/** Reverts the most recently applied migration; returns its version or null. */
export async function migrateDown(
	conn: DuckDBConnection,
	dir = MIGRATIONS_DIR,
): Promise<string | null> {
	await ensureLedger(conn);
	const versions = await appliedVersions(conn);
	const latest = versions.at(-1);
	if (!latest) return null;
	const migration = listMigrations(dir).find((m) => m.version === latest);
	if (!migration)
		throw new Error(
			`No migration file for applied version ${latest}`,
		);
	const downFile = migration.file.replace(/\.up\.sql$/, ".down.sql");
	for (const stmt of statements(
		readFileSync(join(dir, downFile), "utf8"),
	)) {
		await conn.run(stmt);
	}
	await conn.run("DELETE FROM schema_migrations WHERE version = ?", [
		latest,
	]);
	return latest;
}

async function main(): Promise<void> {
	const direction = process.argv[2] === "down" ? "down" : "up";
	const { duckdbPath } = loadConfig();
	if (duckdbPath !== ":memory:")
		mkdirSync(dirname(duckdbPath), { recursive: true });
	const instance = await DuckDBInstance.create(duckdbPath);
	const conn = await instance.connect();
	try {
		if (direction === "up") {
			const applied = await migrateUp(conn);
			console.log(
				applied.length
					? `Applied migrations: ${applied.join(", ")}`
					: "Schema is up to date",
			);
		} else {
			const reverted = await migrateDown(conn);
			console.log(
				reverted
					? `Reverted migration ${reverted}`
					: "Nothing to roll back",
			);
		}
	} finally {
		conn.closeSync();
		instance.closeSync();
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main().catch((err) => {
		console.error("Migration failed:", err);
		process.exit(1);
	});
}
