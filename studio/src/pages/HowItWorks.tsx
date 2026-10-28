import {
	Badge,
	Body1,
	Button,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	Title1,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { Link, useNavigate } from "react-router-dom";
import { CardGrid, InfoCard, Section } from "../components/PublicBits";
import {
	MUTATIONS,
	OWN_AGENT_STEPS,
	SAMPLE_EDGES,
	VERDICTS,
} from "../content/explainer";
import { useAuth } from "../hooks/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES } from "../lib/routes";

const useStyles = makeStyles({
	top: {
		display: "flex",
		flexDirection: "column",
		gap: "12px",
		padding: "40px 0 0",
	},
	mono: { fontFamily: tokens.fontFamilyMonospace },
	formula: {
		padding: "12px 16px",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		fontFamily: tokens.fontFamilyMonospace,
		width: "fit-content",
		maxWidth: "100%",
	},
	list: { margin: 0, paddingLeft: "20px", display: "grid", gap: "6px" },
});

export default function HowItWorks() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { user, required, status } = useAuth();
	const signedIn = status === "ready" && (user !== null || !required);
	useDocumentTitle("How it works");

	return (
		<>
			<div className={styles.top}>
				<Title1 as="h1">
					How Contract Tester works
				</Title1>
				<Body1>
					A short tour of the ideas behind the
					studio. Everything here is what the tool
					does today.
				</Body1>
			</div>

			<Section
				id="contracts"
				title="Workflows, hand-offs and contracts"
				lead="A workflow is a set of agents connected by directed hand-offs, called edges. Every edge carries a strict schema: required keys, types and ranges, with no extra keys allowed. Any payload outside it is a violation."
			>
				<Table
					aria-label="Sample hand-offs"
					size="small"
				>
					<TableHeader>
						<TableRow>
							<TableHeaderCell>
								Hand-off
							</TableHeaderCell>
							<TableHeaderCell>
								Contract
							</TableHeaderCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{SAMPLE_EDGES.map((e) => (
							<TableRow key={e.edge}>
								<TableCell>
									{e.edge}
								</TableCell>
								<TableCell
									className={
										styles.mono
									}
								>
									{
										e.contract
									}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>

			<Section
				id="runs"
				title="What a run does"
				lead="A run visits each hand-off in turn. For every edge it first delivers the untouched baseline payload, then one payload per mutation."
			>
				<ul className={styles.list}>
					<li>
						The proxy wraps the downstream
						agent and intercepts the payload
						on its way.
					</li>
					<li>
						The fuzzer returns a corrupted
						copy; the original is kept for
						comparison.
					</li>
					<li>
						The corrupted payload is
						validated against the contract,
						and violations are recorded.
					</li>
					<li>
						The downstream agent is called
						with the corrupted payload
						regardless, because the point is
						to see how it behaves. Its
						result or error is recorded.
					</li>
					<li>
						Each trace, with both payloads,
						the verdict and the latency, is
						stored and streamed live.
					</li>
				</ul>
			</Section>

			<Section id="mutations" title="Mutation types">
				<CardGrid>
					{MUTATIONS.map((m) => (
						<InfoCard
							key={m.type}
							title={m.title}
							caption={m.type}
						>
							<Body1>{m.what}</Body1>
							<Body1>{m.why}</Body1>
						</InfoCard>
					))}
				</CardGrid>
			</Section>

			<Section
				id="fuzzers"
				title="Heuristic and semantic fuzzers"
				lead="Pick a mode before each run."
			>
				<CardGrid>
					<InfoCard
						title="Heuristic"
						caption="Deterministic, in-process"
					>
						<Body1>
							Applies all four
							mutation types to a
							randomly chosen field.
							It is fast, needs no
							extra service and is
							reproducible from a
							seed.
						</Body1>
					</InfoCard>
					<InfoCard
						title="Semantic"
						caption="Language-model driven"
					>
						<Body1>
							Asks the fuzzer service
							to rewrite values using
							three strategies: invert
							logic, hedge exact
							values into ambiguous
							prose, or inject
							plausible extra fields
							and null an identifier.
							Without a model it uses
							a deterministic mock,
							and if the service is
							down the run falls back
							to heuristic mutations
							and says so on the
							trace.
						</Body1>
					</InfoCard>
				</CardGrid>
			</Section>

			<Section id="verdicts" title="Verdicts and health">
				<Table aria-label="Verdicts" size="small">
					<TableHeader>
						<TableRow>
							<TableHeaderCell>
								Verdict
							</TableHeaderCell>
							<TableHeaderCell>
								Meaning
							</TableHeaderCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{VERDICTS.map((v) => (
							<TableRow key={v.label}>
								<TableCell>
									<Badge
										appearance="tint"
										color={
											v.color
										}
									>
										{
											v.label
										}
									</Badge>
								</TableCell>
								<TableCell>
									{
										v.meaning
									}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<Body1>
					An edge is <b>red</b> if any trace was a
					breach, <b>amber</b> if it had
					violations but no breach, and{" "}
					<b>green</b> otherwise. An agent takes
					the worst health among the edges that
					feed it.
				</Body1>
			</Section>

			<Section
				id="metrics"
				title="Metrics"
				lead="The recovery rate answers one question: when a contract was violated, how often did the downstream agent cope?"
			>
				<div className={styles.formula}>
					recovery rate = recovered violations ÷
					violations
				</div>
				<Body1>
					It is 100% when nothing was violated.
					Mutations that still satisfy the
					contract (bypassed) and baseline
					deliveries are not counted. The
					dashboard also shows contracts checked,
					breaches and average latency.
				</Body1>
			</Section>

			<Section id="replay" title="Reproducing a run">
				<Body1>
					Every run stores a seed. Starting a
					heuristic run with an earlier run's seed
					makes the same random choices again, so
					a failure you found can be reproduced
					and re-tested after a fix.
				</Body1>
			</Section>

			<Section
				id="own-agents"
				title="Testing your own agents"
				lead="A local MCP server connects your AI assistant to Contract Tester. The assistant drives the loop; the gateway plans the cases and judges the results."
			>
				<CardGrid>
					{OWN_AGENT_STEPS.map((s, i) => (
						<InfoCard
							key={s.title}
							title={s.title}
							step={i + 1}
						>
							<Body1>{s.body}</Body1>
						</InfoCard>
					))}
				</CardGrid>
				<ul className={styles.list}>
					<li>
						For each case the gateway sends
						the assistant a baseline or
						mutated payload and the contract
						verdict.
					</li>
					<li>
						The assistant sends it to your
						real agent, unchanged, and
						reports whether the agent
						handled it or failed.
					</li>
					<li>
						The gateway derives the verdict
						(handled, recovered, bypassed or
						breach), stores the trace and
						streams it to your project.
					</li>
					<li>
						Contracts are JSON Schema,
						stored in your workspace under{" "}
						<code>.mml/workflow.json</code>{" "}
						and in your project here.
					</li>
				</ul>
			</Section>

			<Section id="studio" title="Inside the studio">
				<CardGrid>
					<InfoCard title="Contract canvas">
						<Body1>
							The agent graph with
							live edge health, run
							controls and headline
							metrics.
						</Body1>
					</InfoCard>
					<InfoCard title="Payload diff">
						<Body1>
							Expected versus
							received, field by
							field: match, mismatch,
							missing or injected.
						</Body1>
					</InfoCard>
					<InfoCard title="Event log">
						<Body1>
							A live stream of runs
							and traces, with history
							from earlier runs.
						</Body1>
					</InfoCard>
					<InfoCard title="Report export">
						<Body1>
							A self-contained HTML
							report for a chosen run
							that you can share or
							archive.
						</Body1>
					</InfoCard>
				</CardGrid>
			</Section>

			<Section id="limits" title="Good to know">
				<ul className={styles.list}>
					<li>
						The demo project runs a built-in
						sample workflow. Your own
						projects are private to you and
						are tested through your
						assistant; the studio never runs
						code you upload.
					</li>
					<li>
						Payloads in traces are stored as
						sent, so do not push real
						personal or secret data through
						it. See the{" "}
						<Link to={ROUTES.privacy}>
							Privacy Policy
						</Link>
						.
					</li>
					<li>
						Access is limited to approved
						GitHub accounts, under the{" "}
						<Link to={ROUTES.terms}>
							Terms
						</Link>
						.
					</li>
				</ul>
				<span>
					<Button
						appearance="primary"
						onClick={() =>
							navigate(
								signedIn
									? ROUTES.app
									: ROUTES.signIn,
							)
						}
					>
						{signedIn
							? "Open the studio"
							: "Sign in with GitHub"}
					</Button>
				</span>
			</Section>
		</>
	);
}
