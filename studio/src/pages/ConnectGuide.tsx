import {
	Body1,
	Button,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import {
	CardGrid,
	CodeBlock,
	InfoCard,
	Section,
} from "../components/PublicBits";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES } from "../lib/routes";

const useStyles = makeStyles({
	mono: { fontFamily: tokens.fontFamilyMonospace },
	muted: { color: tokens.colorNeutralForeground3 },
	list: { margin: 0, paddingLeft: "20px", display: "grid", gap: "6px" },
});

const VSCODE = `{
  "servers": {
    "mml": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@nexusgit/mml-mcp"]
    }
  }
}`;

const OTHERS = `{
  "mcpServers": {
    "mml": {
      "command": "npx",
      "args": ["-y", "@nexusgit/mml-mcp"]
    }
  }
}`;

const FILES = [
	["config.json", "Which project this workspace belongs to"],
	[
		"workflow.json",
		"Your agents, the hand-offs between them, each JSON Schema contract and a baseline payload",
	],
	[
		"runs/<runId>.json",
		"Summary of each finished run (counts only, no payloads)",
	],
	["latest.md", "Readable summary of the most recent run"],
];

const TOOLS = [
	["mml_login, mml_login_status", "Sign in with GitHub from the editor"],
	["mml_init", "Create a project and the .mml folder"],
	["mml_infer_schema", "Draft a contract from sample payloads"],
	["mml_set_workflow", "Save agents, hand-offs and contracts"],
	[
		"mml_start_run, mml_report_result",
		"Run cases against your real agents, one at a time",
	],
	[
		"mml_run_summary, mml_status, mml_dashboard_url",
		"Read results and open them here",
	],
];

/** How to wire your own agents to the tool through the local MCP server. */
export default function ConnectGuide() {
	const styles = useStyles();
	const navigate = useNavigate();
	useDocumentTitle("Connect your agents");

	return (
		<>
			<Title2 as="h1">Connect your own agents</Title2>
			<Body1 className={styles.muted}>
				Contract Tester does not run your code. Your AI
				assistant does: it calls your agents with the
				payloads Contract Tester prepares and reports
				what happened, through a small MCP server that
				runs on your machine.
			</Body1>

			<Section id="steps" title="Four steps">
				<CardGrid>
					<InfoCard
						title="Add the MCP server"
						step={1}
					>
						<Body1>
							Add it to your editor's
							MCP configuration. It
							needs Node 20 or newer.
						</Body1>
					</InfoCard>
					<InfoCard title="Sign in" step={2}>
						<Body1>
							Ask the assistant to{" "}
							<b>
								sign in to
								Contract Tester
							</b>
							. It shows a link and a
							code; open it here,
							check the code and
							approve.
						</Body1>
					</InfoCard>
					<InfoCard
						title="Define the contracts"
						step={3}
					>
						<Body1>
							Run the{" "}
							<b>
								mml-define-contracts
							</b>{" "}
							prompt. The assistant
							finds your agents,
							drafts a JSON Schema for
							each hand-off from
							sample payloads and
							saves them to a{" "}
							<code>.mml</code>{" "}
							folder.
						</Body1>
					</InfoCard>
					<InfoCard title="Run a pass" step={4}>
						<Body1>
							Run the{" "}
							<b>mml-run-pass</b>{" "}
							prompt. The assistant
							sends each case to your
							agent and reports the
							outcome. Results appear
							in your project here as
							they arrive.
						</Body1>
					</InfoCard>
				</CardGrid>
			</Section>

			<Section id="config" title="MCP configuration">
				<Body1>
					VS Code, in{" "}
					<code>.vscode/mcp.json</code>:
				</Body1>
				<CodeBlock label="VS Code MCP configuration">
					{VSCODE}
				</CodeBlock>
				<Body1>
					Claude Desktop, Cursor and most other
					clients, in their MCP settings file:
				</Body1>
				<CodeBlock label="MCP configuration for other clients">
					{OTHERS}
				</CodeBlock>
				<Body1 className={styles.muted}>
					Set <code>MML_API_URL</code> only if you
					run your own gateway. The sign-in token
					is stored in{" "}
					<code>~/.mml/credentials.json</code>,
					readable only by you.
				</Body1>
			</Section>

			<Section id="folder" title="The .mml folder">
				<Body1>
					The server creates it in your workspace.
					It holds context for this repository and
					never any credentials, so it is safe to
					commit.
				</Body1>
				<Table aria-label=".mml files" size="small">
					<TableHeader>
						<TableRow>
							<TableHeaderCell>
								File
							</TableHeaderCell>
							<TableHeaderCell>
								What it is
							</TableHeaderCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{FILES.map(([file, what]) => (
							<TableRow key={file}>
								<TableCell
									className={
										styles.mono
									}
								>
									{file}
								</TableCell>
								<TableCell>
									{what}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>

			<Section id="tools" title="What the assistant can do">
				<Table aria-label="MCP tools" size="small">
					<TableHeader>
						<TableRow>
							<TableHeaderCell>
								Tool
							</TableHeaderCell>
							<TableHeaderCell>
								Purpose
							</TableHeaderCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{TOOLS.map(([tool, what]) => (
							<TableRow key={tool}>
								<TableCell
									className={
										styles.mono
									}
								>
									{tool}
								</TableCell>
								<TableCell>
									{what}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>

			<Section id="privacy" title="Before you start">
				<ul className={styles.list}>
					<li>
						Baseline and mutated payloads
						are stored on the gateway so you
						can inspect them. Use synthetic
						data, not real personal or
						secret data.
					</li>
					<li>
						The server only talks to your
						assistant and to the gateway. It
						runs none of your code.
					</li>
					<li>
						You can see every connected tool
						and revoke it on your account
						page. A run is limited to 100
						cases.
					</li>
				</ul>
				<span>
					<Button
						appearance="primary"
						onClick={() =>
							navigate(
								ROUTES.projects,
							)
						}
					>
						Go to projects
					</Button>{" "}
					<Button
						onClick={() =>
							navigate(ROUTES.account)
						}
					>
						Connected tools
					</Button>
				</span>
			</Section>
		</>
	);
}
