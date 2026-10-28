import { hostname } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GatewayClient, GatewayError, NotSignedInError } from "./api.js";
import type { CredentialStore } from "./credentials.js";
import {
	describeCase,
	describeSummary,
	summaryMarkdown,
	type RunSummary,
	type Step,
} from "./format.js";
import { inferSchema } from "./schema.js";
import {
	MML_DIR,
	WorkspaceError,
	defaultProjectName,
	readConfig,
	readLatest,
	readWorkflow,
	resolveWorkspace,
	scaffold,
	writeRunSummary,
	writeWorkflow,
	type WorkflowFile,
} from "./workspace.js";

export interface ServerOptions {
	apiUrl: string;
	credentials: CredentialStore;
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	version?: string;
}

interface DeviceStart {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
}

interface Pending {
	deviceCode: string;
	userCode: string;
	interval: number;
	expiresAt: number;
}

interface Me {
	login: string;
	method: string;
	expiresAt: string | null;
}

interface ProjectInfo {
	projectId: string;
	name: string;
	isDemo: boolean;
	edgeCount: number;
}

type ToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

const text = (value: string): ToolResult => ({
	content: [{ type: "text", text: value }],
});

function failure(err: unknown): ToolResult {
	let message = err instanceof Error ? err.message : String(err);
	if (err instanceof GatewayError && err.details !== undefined) {
		message += `\n${JSON.stringify(err.details, null, 2)}`;
	}
	if (err instanceof NotSignedInError)
		message += "\nUse mml_login to sign in with GitHub.";
	if (err instanceof WorkspaceError) message += "";
	return { isError: true, content: [{ type: "text", text: message }] };
}

const workspaceArg = z
	.string()
	.optional()
	.describe(
		"Absolute path of the workspace folder. Defaults to the server's working directory.",
	);

const AgentSchema = z.object({
	id: z.string().describe("Lowercase id such as intake or price-checker"),
	name: z.string(),
	role: z.string().optional(),
});

const EdgeSchema = z.object({
	id: z.string().describe("Lowercase id, for example intake-pricer"),
	source: z.string().describe("Id of the agent that sends the payload"),
	target: z.string().describe("Id of the agent that receives it"),
	label: z.string().optional(),
	schema: z
		.record(z.unknown())
		.describe(
			'JSON Schema of the payload. Must have "type": "object"; use additionalProperties: false.',
		),
	contractHint: z
		.string()
		.optional()
		.describe(
			"Plain-language description of the contract, used by the semantic fuzzer",
		),
	baseline: z
		.record(z.unknown())
		.describe(
			"A valid example payload. Use synthetic data: it is uploaded to the gateway.",
		),
});

export function createMmlServer(options: ServerOptions): McpServer {
	const { apiUrl, credentials } = options;
	const sleep =
		options.sleep ??
		((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const client = new GatewayClient(
		apiUrl,
		credentials,
		options.fetchImpl,
	);
	let pending: Pending | null = null;

	const server = new McpServer({
		name: "mml",
		version: options.version ?? "0.1.0",
	});

	const studioUrl = async (): Promise<string | null> => {
		try {
			const status = await client.request<{
				studioUrl: string | null;
			}>("GET", "/v1/auth/status", undefined, {
				auth: false,
			});
			return status.studioUrl;
		} catch {
			return null;
		}
	};
	const dashboard = async (
		projectId: string,
	): Promise<string | undefined> => {
		const base = await studioUrl();
		return base
			? `${base}/app?project=${encodeURIComponent(projectId)}`
			: undefined;
	};
	const configFor = async (workspacePath?: string) => {
		const workspace = await resolveWorkspace(workspacePath);
		return { workspace, config: await readConfig(workspace) };
	};

	// --- sign-in -----------------------------------------------------------------------------

	server.registerTool(
		"mml_login",
		{
			title: "Sign in to Contract Tester",
			description:
				"Starts sign-in with GitHub. Returns a URL and a code for the user to approve in their browser, then call mml_login_status to finish.",
			inputSchema: {
				clientName: z
					.string()
					.max(80)
					.optional()
					.describe(
						"Name shown on the approval page",
					),
			},
		},
		async ({ clientName }) => {
			try {
				const start = await client.request<DeviceStart>(
					"POST",
					"/v1/device/code",
					{
						clientName:
							clientName ??
							`MCP client on ${hostname()}`,
					},
					{ auth: false },
				);
				pending = {
					deviceCode: start.device_code,
					userCode: start.user_code,
					interval: start.interval,
					expiresAt:
						Date.now() +
						start.expires_in * 1000,
				};
				return text(
					[
						"Ask the user to open this link, sign in with GitHub and approve the request:",
						start.verification_uri_complete,
						"",
						`Code: ${start.user_code} (enter it at ${start.verification_uri} if the link does not pre-fill it)`,
						`The code expires in ${Math.round(start.expires_in / 60)} minutes.`,
						"When they have approved it, call mml_login_status.",
					].join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_login_status",
		{
			title: "Finish sign-in",
			description:
				"Waits for the user to approve the sign-in started by mml_login and stores the token in ~/.mml.",
			inputSchema: {
				waitSeconds: z
					.number()
					.int()
					.min(0)
					.max(120)
					.default(30)
					.describe("How long to keep polling"),
			},
		},
		async ({ waitSeconds }) => {
			const current = pending;
			if (!current)
				return failure(
					new Error(
						"No sign-in in progress. Call mml_login first.",
					),
				);
			const deadline = Date.now() + waitSeconds * 1000;
			let interval = current.interval;
			try {
				for (;;) {
					if (Date.now() >= current.expiresAt) {
						pending = null;
						return failure(
							new Error(
								"The code expired. Call mml_login again.",
							),
						);
					}
					try {
						const token =
							await client.request<{
								access_token: string;
								expires_in: number;
								login: string;
							}>(
								"POST",
								"/v1/device/token",
								{
									device_code:
										current.deviceCode,
								},
								{ auth: false },
							);
						await credentials.set(apiUrl, {
							token: token.access_token,
							login: token.login,
							expiresAt: new Date(
								Date.now() +
									token.expires_in *
										1000,
							).toISOString(),
						});
						pending = null;
						return text(
							`Signed in as ${token.login}. Next: mml_init to set up this workspace.`,
						);
					} catch (err) {
						const code =
							err instanceof
							GatewayError
								? err.code
								: undefined;
						if (code === "access_denied") {
							pending = null;
							return failure(
								new Error(
									"The sign-in was denied in the browser.",
								),
							);
						}
						if (code === "expired_token") {
							pending = null;
							return failure(
								new Error(
									"The code expired. Call mml_login again.",
								),
							);
						}
						if (code === "slow_down")
							interval += 5;
						else if (
							code !==
							"authorization_pending"
						)
							throw err;
					}
					if (
						Date.now() + interval * 1000 >
						deadline
					) {
						return text(
							`Still waiting for approval of code ${current.userCode}. Call mml_login_status again once the user has approved it.`,
						);
					}
					await sleep(interval * 1000);
				}
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_logout",
		{
			title: "Sign out",
			description:
				"Revokes this machine's token on the gateway and removes it from ~/.mml.",
			inputSchema: {},
		},
		async () => {
			try {
				await client
					.request("POST", "/v1/auth/logout", {})
					.catch(() => undefined);
				await credentials.delete(apiUrl);
				return text(
					"Signed out. The token was revoked and removed from ~/.mml.",
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_whoami",
		{
			title: "Who am I",
			description:
				"Shows which GitHub account this machine is signed in as.",
			inputSchema: {},
		},
		async () => {
			try {
				const me = await client.request<Me>(
					"GET",
					"/v1/auth/me",
				);
				return text(
					`Signed in as ${me.login} (${me.method}).${me.expiresAt ? ` Token expires ${me.expiresAt}.` : ""}`,
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	// --- workspace and workflow ---------------------------------------------------------------

	server.registerTool(
		"mml_list_projects",
		{
			title: "List projects",
			description:
				"Lists your Contract Tester projects, plus the built-in demo project.",
			inputSchema: {},
		},
		async () => {
			try {
				const { projects } = await client.request<{
					projects: ProjectInfo[];
				}>("GET", "/v1/projects");
				return text(
					projects
						.map(
							(p) =>
								`${p.projectId}  ${p.name}${p.isDemo ? " (demo)" : ""}  ${p.edgeCount} edges`,
						)
						.join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_init",
		{
			title: "Set up this workspace",
			description: `Creates a Contract Tester project and a ${MML_DIR}/ folder in the workspace (config, README, .gitignore). Safe to commit: it never holds credentials.`,
			inputSchema: {
				name: z
					.string()
					.max(80)
					.optional()
					.describe(
						"Project name, defaults to the folder name",
					),
				workspacePath: workspaceArg,
				force: z
					.boolean()
					.default(false)
					.describe(
						"Create a new project even if the workspace already has one",
					),
			},
		},
		async ({ name, workspacePath, force }) => {
			try {
				const workspace =
					await resolveWorkspace(workspacePath);
				if (!force) {
					const existing = await readConfig(
						workspace,
					).catch(() => null);
					if (existing) {
						return text(
							`This workspace is already set up for project "${existing.projectName}" (${existing.projectId}). Pass force to create a new one.`,
						);
					}
				}
				const projectName =
					name ?? defaultProjectName(workspace);
				const project =
					await client.request<ProjectInfo>(
						"POST",
						"/v1/projects",
						{ name: projectName },
					);
				const files = await scaffold(workspace, {
					version: 1,
					apiUrl,
					projectId: project.projectId,
					projectName: project.name,
				});
				const url = await dashboard(project.projectId);
				return text(
					[
						`Created project "${project.name}" (${project.projectId}).`,
						`Wrote ${files.join(", ")}.`,
						url ? `Dashboard: ${url}` : "",
						"",
						"Next: work out the agents in this workspace and the payloads they pass to each other, then call mml_set_workflow. Use mml_infer_schema to draft contracts from real sample payloads.",
					]
						.filter((l) => l !== "")
						.join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_infer_schema",
		{
			title: "Draft a contract from samples",
			description:
				"Drafts a strict JSON Schema from example payloads (types observed, keys present in every sample required, extra keys forbidden). Review and tighten it before using it as a contract.",
			inputSchema: {
				samples: z
					.array(z.record(z.unknown()))
					.min(1)
					.max(50)
					.describe(
						"Example payloads sent from one agent to another",
					),
			},
		},
		async ({ samples }) => {
			try {
				return text(
					JSON.stringify(
						inferSchema(samples),
						null,
						2,
					),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_set_workflow",
		{
			title: "Define agents, hand-offs and contracts",
			description: `Defines the workflow under test: agents, the edges between them, each edge's JSON Schema contract and a valid baseline payload. Validated by the gateway, then saved to ${MML_DIR}/workflow.json. Replaces any earlier workflow.`,
			inputSchema: {
				agents: z.array(AgentSchema).min(1).max(50),
				edges: z.array(EdgeSchema).min(1).max(50),
				workspacePath: workspaceArg,
			},
		},
		async ({ agents, edges, workspacePath }) => {
			try {
				const { workspace, config } =
					await configFor(workspacePath);
				const saved = await client.request<{
					agents: WorkflowFile["agents"];
					edges: WorkflowFile["edges"];
				}>(
					"PUT",
					`/v1/projects/${encodeURIComponent(config.projectId)}/workflow`,
					{ agents, edges },
				);
				await writeWorkflow(workspace, {
					agents: saved.agents,
					edges: saved.edges,
				});
				return text(
					[
						`Saved ${saved.agents.length} agents and ${saved.edges.length} edges to ${MML_DIR}/workflow.json:`,
						...saved.edges.map(
							(e) =>
								`- ${e.id}: ${e.source} -> ${e.target}`,
						),
						"",
						"Next: call mml_start_run to test them.",
					].join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_status",
		{
			title: "Workspace status",
			description:
				"Shows the project this workspace belongs to, its edges and the latest run summary, if any.",
			inputSchema: { workspacePath: workspaceArg },
		},
		async ({ workspacePath }) => {
			try {
				const { workspace, config } =
					await configFor(workspacePath);
				const workflow = await readWorkflow(workspace);
				const latest = await readLatest(workspace);
				const url = await dashboard(config.projectId);
				return text(
					[
						`Project: ${config.projectName} (${config.projectId})`,
						workflow
							? `Workflow: ${workflow.agents.length} agents, ${workflow.edges.length} edges (${workflow.edges.map((e) => e.id).join(", ")})`
							: "Workflow: not defined yet. Call mml_set_workflow.",
						url ? `Dashboard: ${url}` : "",
						latest ? `\n${latest}` : "",
					]
						.filter((l) => l !== "")
						.join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	// --- runs ---------------------------------------------------------------------------------

	server.registerTool(
		"mml_start_run",
		{
			title: "Start a test run",
			description:
				"Starts an adversarial run over the project's edges and returns the first case. For each case you send a (possibly corrupted) payload to the user's real agent and report whether it handled it with mml_report_result.",
			inputSchema: {
				fuzzerMode: z
					.enum(["heuristic", "semantic"])
					.default("heuristic")
					.describe(
						"heuristic: deterministic mutations. semantic: model-driven rewrites.",
					),
				edgeIds: z
					.array(z.string())
					.optional()
					.describe(
						"Limit the run to these edges",
					),
				seed: z
					.string()
					.max(128)
					.optional()
					.describe(
						"Reuse an earlier run's seed to reproduce its mutations",
					),
				workspacePath: workspaceArg,
			},
		},
		async ({ fuzzerMode, edgeIds, seed, workspacePath }) => {
			try {
				const { config } =
					await configFor(workspacePath);
				const started = await client.request<{
					runId: string;
					seed: string;
					totalCases: number;
					case: Parameters<
						typeof describeCase
					>[1];
				}>(
					"POST",
					`/v1/projects/${encodeURIComponent(config.projectId)}/runs`,
					{
						fuzzerMode,
						edgeIds,
						seed,
					},
				);
				return text(
					[
						`Run ${started.runId} started with ${started.totalCases} cases (seed ${started.seed}).`,
						"",
						describeCase(
							started.runId,
							started.case,
						),
					].join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_report_result",
		{
			title: "Report the outcome of a case",
			description:
				"Reports how the user's agent handled a case and returns the next case, or the final summary when the run is complete.",
			inputSchema: {
				runId: z.string(),
				caseId: z.string(),
				handled: z
					.boolean()
					.describe(
						"true if the agent returned normally, false if it threw or failed",
					),
				error: z
					.string()
					.max(4000)
					.optional()
					.describe(
						"Error message or stack summary when handled is false",
					),
				durationMs: z
					.number()
					.min(0)
					.optional()
					.describe("How long the agent took"),
				workspacePath: workspaceArg,
			},
		},
		async ({
			runId,
			caseId,
			handled,
			error,
			durationMs,
			workspacePath,
		}) => {
			try {
				const step = await client.request<Step>(
					"POST",
					`/v1/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/result`,
					{ handled, error, durationMs },
				);
				if (!step.done)
					return text(
						describeCase(runId, step.case),
					);

				const lines = [
					describeSummary(
						step.summary,
						await dashboard(
							step.summary.projectId,
						),
					),
				];
				try {
					const { workspace, config } =
						await configFor(workspacePath);
					const written = await writeRunSummary(
						workspace,
						runId,
						step.summary,
						summaryMarkdown(
							step.summary,
							config.projectName,
							new Date().toISOString(),
						),
					);
					lines.push(
						`Saved ${written.join(" and ")}.`,
					);
				} catch {
					// The run itself is complete; a missing workspace only skips the local summary.
				}
				return text(lines.join("\n"));
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_run_summary",
		{
			title: "Summarise a run",
			description:
				"Fetches the stored summary of a finished run (the latest by default) and saves it under .mml/.",
			inputSchema: {
				runId: z.string().optional(),
				workspacePath: workspaceArg,
			},
		},
		async ({ runId, workspacePath }) => {
			try {
				const { workspace, config } =
					await configFor(workspacePath);
				const { runs } = await client.request<{
					runs: {
						runId: string;
						completedAt: string | null;
						seed: string | null;
						brokenContracts: number;
						recoveryRate: number;
						edges: {
							edgeId: string;
							total: number;
							violations: number;
							recovered: number;
							breached: number;
							health: string;
						}[];
					}[];
				}>(
					"GET",
					`/v1/runs?projectId=${encodeURIComponent(config.projectId)}`,
				);
				const found = runId
					? runs.find((r) => r.runId === runId)
					: runs.find((r) => r.completedAt);
				if (!found)
					return failure(
						new Error(
							runId
								? `Run ${runId} not found`
								: "No finished runs yet",
						),
					);
				const run = found;

				const sum = (
					pick: (
						e: (typeof run.edges)[number],
					) => number,
				) => run.edges.reduce((n, e) => n + pick(e), 0);
				const summary: RunSummary = {
					runId: run.runId,
					projectId: config.projectId,
					totalCases: sum((e) => e.total),
					reported: sum((e) => e.total),
					violations: sum((e) => e.violations),
					recovered: sum((e) => e.recovered),
					breaches: sum((e) => e.breached),
					bypassed: 0,
					recoveryRate: run.recoveryRate,
				};
				await writeRunSummary(
					workspace,
					run.runId,
					{
						...summary,
						seed: run.seed,
						edges: run.edges,
					},
					summaryMarkdown(
						summary,
						config.projectName,
						run.completedAt ??
							new Date().toISOString(),
					),
				);
				return text(
					[
						describeSummary(
							summary,
							await dashboard(
								config.projectId,
							),
						),
						"",
						...run.edges.map(
							(e) =>
								`- ${e.edgeId}: ${e.health} (${e.violations} violations, ${e.recovered} recovered, ${e.breached} breaches of ${e.total})`,
						),
					].join("\n"),
				);
			} catch (err) {
				return failure(err);
			}
		},
	);

	server.registerTool(
		"mml_dashboard_url",
		{
			title: "Open the dashboard",
			description:
				"Returns the studio link for this workspace's project.",
			inputSchema: { workspacePath: workspaceArg },
		},
		async ({ workspacePath }) => {
			try {
				const { config } =
					await configFor(workspacePath);
				const url = await dashboard(config.projectId);
				return url
					? text(url)
					: failure(
							new Error(
								"The gateway did not report a studio URL.",
							),
						);
			} catch (err) {
				return failure(err);
			}
		},
	);

	// --- resources and prompts ----------------------------------------------------------------

	server.registerResource(
		"workflow",
		"mml://workflow",
		{
			title: "Workflow definition",
			description: `Contents of ${MML_DIR}/workflow.json for the current workspace`,
			mimeType: "application/json",
		},
		async (uri) => {
			const workspace = await resolveWorkspace();
			const workflow = await readWorkflow(workspace);
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: workflow
							? JSON.stringify(
									workflow,
									null,
									2,
								)
							: "null",
					},
				],
			};
		},
	);

	server.registerResource(
		"latest-run",
		"mml://latest-run",
		{
			title: "Latest run summary",
			description: `Contents of ${MML_DIR}/latest.md`,
			mimeType: "text/markdown",
		},
		async (uri) => {
			const workspace = await resolveWorkspace();
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "text/markdown",
						text:
							(await readLatest(
								workspace,
							)) ??
							"No run has finished in this workspace yet.",
					},
				],
			};
		},
	);

	server.registerPrompt(
		"mml-define-contracts",
		{
			title: "Define contracts for my agents",
			description:
				"Guides the assistant through finding the agents in this workspace and writing their hand-off contracts.",
			argsSchema: { focus: z.string().optional() },
		},
		({ focus }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							"Set up Contract Tester for this workspace.",
							focus
								? `Focus on: ${focus}`
								: "",
							"1. If not signed in, call mml_login, show me the link, then call mml_login_status.",
							"2. Call mml_init if the workspace has no .mml folder.",
							"3. Read the code to find each agent (an LLM call, a tool, a service) and the JSON each one passes to the next.",
							"4. For every hand-off, collect two or three realistic synthetic sample payloads and call mml_infer_schema. Tighten the draft: enums, ranges, required keys.",
							"5. Call mml_set_workflow with the agents, edges, schemas and one valid baseline payload per edge.",
							"6. Tell me which edges you defined and what each contract enforces.",
						]
							.filter(Boolean)
							.join("\n"),
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"mml-run-pass",
		{
			title: "Run an adversarial pass",
			description:
				"Runs every case against the real agents and summarises the findings.",
			argsSchema: {
				mode: z
					.enum(["heuristic", "semantic"])
					.optional(),
			},
		},
		({ mode }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Run an adversarial pass with Contract Tester (${mode ?? "heuristic"} mode).`,
							"1. Call mml_start_run.",
							"2. For each case, send the payload exactly as given to the named target agent in this workspace, observe whether it returns normally or fails, and call mml_report_result. Do not repair or retry the agent between cases.",
							"3. Continue until mml_report_result returns the final summary.",
							"4. Explain which hand-offs are fragile, which contracts have gaps (bypassed cases), and suggest fixes.",
						].join("\n"),
					},
				},
			],
		}),
	);

	return server;
}
