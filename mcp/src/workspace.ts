import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { z } from "zod";

export const MML_DIR = ".mml";

export const ConfigSchema = z.object({
	version: z.literal(1),
	apiUrl: z.string().url(),
	projectId: z.string().min(1),
	projectName: z.string().min(1),
});
export type MmlConfig = z.infer<typeof ConfigSchema>;

export interface WorkflowFile {
	agents: { id: string; name: string; role?: string }[];
	edges: {
		id: string;
		source: string;
		target: string;
		label?: string;
		schema: Record<string, unknown>;
		contractHint?: string | null;
		baseline: Record<string, unknown>;
	}[];
}

export class WorkspaceError extends Error {}

const README = `# .mml

This folder is created by the Contract Tester MCP server (\`mml-mcp\`). It holds context about
how this workspace is tested. It never contains credentials, so it is safe to commit.

| File | What it is |
| --- | --- |
| \`config.json\` | Which Contract Tester project this workspace belongs to |
| \`workflow.json\` | Your agents, the hand-offs (edges) between them, each edge's JSON Schema contract and a baseline example payload |
| \`runs/<runId>.json\` | Summary of a finished test run (verdict counts, no payloads) |
| \`latest.md\` | Human-readable summary of the most recent run |

Sign-in tokens are stored in \`~/.mml/credentials.json\` in your home directory, outside any project.
Baseline payloads in \`workflow.json\` are uploaded to the gateway, so use synthetic data, not real
personal or secret data.
`;

const GITIGNORE = "runs/\ncache/\n";

/** Resolves the workspace folder and refuses places where writing `.mml` would be wrong. */
export async function resolveWorkspace(input?: string): Promise<string> {
	const root = resolve(
		input ?? process.env.MML_WORKSPACE ?? process.cwd(),
	);
	let info;
	try {
		info = await stat(root);
	} catch {
		throw new WorkspaceError(
			`Workspace folder does not exist: ${root}`,
		);
	}
	if (!info.isDirectory())
		throw new WorkspaceError(`Workspace is not a folder: ${root}`);
	// ~/.mml holds credentials, so a workspace .mml must never be the same folder.
	if (root === resolve(homedir()) || root === resolve(sep)) {
		throw new WorkspaceError(
			`Refusing to use ${root} as a workspace. Open a project folder or pass workspacePath.`,
		);
	}
	return root;
}

export const mmlDir = (workspace: string) => join(workspace, MML_DIR);

/** Resolves a path inside .mml and checks, through symlinks, that it stays inside the workspace. */
async function safePath(
	workspace: string,
	...segments: string[]
): Promise<string> {
	const dir = mmlDir(workspace);
	const target = resolve(dir, ...segments);
	if (target !== dir && !target.startsWith(dir + sep)) {
		throw new WorkspaceError("Path escapes the .mml folder");
	}
	try {
		const real = await realpath(dir);
		const realWorkspace = await realpath(workspace);
		if (real !== join(realWorkspace, MML_DIR)) {
			throw new WorkspaceError(
				".mml points outside the workspace",
			);
		}
	} catch (err) {
		if (err instanceof WorkspaceError) throw err;
		// .mml does not exist yet, which is fine before scaffolding.
	}
	return target;
}

async function writeIfMissing(path: string, content: string): Promise<boolean> {
	try {
		await stat(path);
		return false;
	} catch {
		await writeFile(path, content, "utf8");
		return true;
	}
}

export async function scaffold(
	workspace: string,
	config: MmlConfig,
): Promise<string[]> {
	await mkdir(await safePath(workspace, "runs"), { recursive: true });
	const created: string[] = [];
	await writeFile(
		await safePath(workspace, "config.json"),
		JSON.stringify(config, null, 2) + "\n",
		"utf8",
	);
	created.push(`${MML_DIR}/config.json`);
	if (
		await writeIfMissing(
			await safePath(workspace, "README.md"),
			README,
		)
	) {
		created.push(`${MML_DIR}/README.md`);
	}
	if (
		await writeIfMissing(
			await safePath(workspace, ".gitignore"),
			GITIGNORE,
		)
	) {
		created.push(`${MML_DIR}/.gitignore`);
	}
	return created;
}

export async function readConfig(workspace: string): Promise<MmlConfig> {
	let raw: string;
	try {
		raw = await readFile(
			await safePath(workspace, "config.json"),
			"utf8",
		);
	} catch {
		throw new WorkspaceError(
			`No ${MML_DIR}/config.json in ${workspace}. Call mml_init first.`,
		);
	}
	const parsed = ConfigSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		throw new WorkspaceError(
			`${MML_DIR}/config.json is invalid: ${parsed.error.issues[0]?.message}`,
		);
	}
	return parsed.data;
}

export async function writeWorkflow(
	workspace: string,
	workflow: WorkflowFile,
): Promise<void> {
	await writeFile(
		await safePath(workspace, "workflow.json"),
		JSON.stringify(workflow, null, 2) + "\n",
		"utf8",
	);
}

export async function readWorkflow(
	workspace: string,
): Promise<WorkflowFile | null> {
	try {
		return JSON.parse(
			await readFile(
				await safePath(workspace, "workflow.json"),
				"utf8",
			),
		) as WorkflowFile;
	} catch {
		return null;
	}
}

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function writeRunSummary(
	workspace: string,
	runId: string,
	summary: unknown,
	markdown: string,
): Promise<string[]> {
	if (!RUN_ID.test(runId)) throw new WorkspaceError("Unexpected run id");
	await mkdir(await safePath(workspace, "runs"), { recursive: true });
	await writeFile(
		await safePath(workspace, "runs", `${runId}.json`),
		JSON.stringify(summary, null, 2) + "\n",
		"utf8",
	);
	await writeFile(
		await safePath(workspace, "latest.md"),
		markdown,
		"utf8",
	);
	return [`${MML_DIR}/runs/${runId}.json`, `${MML_DIR}/latest.md`];
}

export async function readLatest(workspace: string): Promise<string | null> {
	try {
		return await readFile(
			await safePath(workspace, "latest.md"),
			"utf8",
		);
	} catch {
		return null;
	}
}

export const defaultProjectName = (workspace: string) =>
	basename(workspace) || "workspace";
