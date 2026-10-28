import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
	Badge,
	Body1,
	Button,
	Caption1,
	Card,
	Subtitle1,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular, BookRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import {
	CardGrid,
	CodeBlock,
	InfoCard,
	Section,
} from "../components/PublicBits";
import { Hero } from "../components/Hero";
import {
	EXAMPLES,
	FAQ,
	MUTATIONS,
	SAMPLE_EDGES,
	VERDICTS,
} from "../content/explainer";
import { useAuth } from "../hooks/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES } from "../lib/routes";

const useStyles = makeStyles({
	hero: { paddingTop: "32px" },
	exampleGrid: {
		display: "grid",
		gap: "16px",
		gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
	},
	exampleBody: {
		display: "flex",
		flexDirection: "column",
		gap: "10px",
	},
	label: {
		color: tokens.colorNeutralForeground3,
		textTransform: "uppercase",
		letterSpacing: "0.06em",
		fontWeight: 600,
	},
	cta: {
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-start",
		gap: "12px",
		margin: "24px 0 48px",
		padding: "28px",
		borderRadius: tokens.borderRadiusXLarge,
		backgroundColor: tokens.colorNeutralBackground3,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
	},
	mono: { fontFamily: tokens.fontFamilyMonospace },
});

const STEPS = [
	{
		title: "Define the contract",
		body: "Each hand-off between two agents has a strict schema. Anything outside it is a violation.",
	},
	{
		title: "Mutate the payload",
		body: "A fuzzer corrupts the JSON in transit: swapped types, missing keys, overflowing numbers, drifting meaning.",
	},
	{
		title: "Judge the outcome",
		body: "The contract is checked, then the downstream agent runs. Did it recover, crash, or never notice?",
	},
	{
		title: "Review and share",
		body: "Compare expected and received fields, follow the live event log, and export a self-contained HTML report.",
	},
];

const PROBLEMS = [
	{
		title: "Agents trust each other",
		body: "A downstream agent usually assumes the upstream one produced exactly what it expects. LLM output breaks that assumption without warning.",
	},
	{
		title: "A schema is not enough",
		body: "A payload can be perfectly valid and still wrong. Valid-looking drift is the failure mode that reaches production unnoticed.",
	},
	{
		title: "You learn it in production",
		body: "Without deliberate fault injection, the first time a hand-off fails is when a real user is waiting on it.",
	},
];

export default function Landing() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { user, required, status } = useAuth();
	const signedIn = status === "ready" && (user !== null || !required);
	useDocumentTitle("");

	const start = () => navigate(signedIn ? ROUTES.app : ROUTES.signIn);

	return (
		<>
			<div className={styles.hero}>
				<Hero
					eyebrow="Adversarial contract tester"
					title="Find out what breaks when your agents hand each other bad data"
					subtitle="Contract Tester corrupts the JSON your AI agents pass to one another, checks every hand-off against its contract, and shows which agents recover and which crash."
					primary={{
						label: signedIn
							? "Open the studio"
							: "Sign in with GitHub",
						icon: <ArrowRightRegular />,
						onClick: start,
					}}
					secondary={{
						label: "How it works",
						icon: <BookRegular />,
						onClick: () =>
							navigate(ROUTES.how),
					}}
				/>
			</div>

			<Section
				id="problem"
				title="Multi-agent systems fail at the seams"
				lead="Each agent can pass its own tests and the pipeline can still fail, because the bugs live in the hand-offs."
			>
				<CardGrid>
					{PROBLEMS.map((p) => (
						<InfoCard
							key={p.title}
							title={p.title}
						>
							<Body1>{p.body}</Body1>
						</InfoCard>
					))}
				</CardGrid>
			</Section>

			<Section
				id="how"
				title="How it works"
				lead="Four steps, repeated for every hand-off in the workflow."
			>
				<CardGrid>
					{STEPS.map((s, i) => (
						<InfoCard
							key={s.title}
							title={s.title}
							step={i + 1}
						>
							<Body1>{s.body}</Body1>
						</InfoCard>
					))}
				</CardGrid>
			</Section>

			<Section
				id="example"
				title="Three payloads, three different verdicts"
				lead="From the sample claims workflow. The same kind of attack can crash an agent, be absorbed, or slip straight through."
			>
				<div className={styles.exampleGrid}>
					{EXAMPLES.map((ex) => (
						<Card key={ex.title}>
							<div
								className={
									styles.exampleBody
								}
							>
								<Subtitle1 as="h3">
									{
										ex.title
									}
								</Subtitle1>
								<Caption1>
									{
										ex.edge
									}
								</Caption1>
								<Caption1
									className={
										styles.label
									}
								>
									Mutation
								</Caption1>
								<Body1
									className={
										styles.mono
									}
								>
									{
										ex.mutation
									}
								</Body1>
								<Caption1
									className={
										styles.label
									}
								>
									Delivered
									payload
								</Caption1>
								<CodeBlock
									label={`Payload for ${ex.title}`}
								>
									{
										ex.delivered
									}
								</CodeBlock>
								<Caption1
									className={
										styles.label
									}
								>
									Contract
								</Caption1>
								<Body1>
									{
										ex.contract
									}
								</Body1>
								<Caption1
									className={
										styles.label
									}
								>
									Downstream
									agent
								</Caption1>
								<Body1>
									{
										ex.agent
									}
								</Body1>
								<span>
									<Badge
										appearance="tint"
										color={
											ex
												.verdict
												.color
										}
									>
										{
											ex
												.verdict
												.label
										}
									</Badge>
								</span>
							</div>
						</Card>
					))}
				</div>
			</Section>

			<Section
				id="mutations"
				title="Four ways to corrupt a payload"
				lead="Heuristic mode applies these deterministically. Semantic mode rewrites values with a language model, or a reproducible mock, for more realistic drift."
			>
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

			<Section id="verdicts" title="Reading the results">
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
					Each hand-off is rated <b>green</b> (no
					violations), <b>amber</b> (violations
					the agent survived) or <b>red</b> (at
					least one breach). The{" "}
					<b>recovery rate</b> is the share of
					contract violations the downstream agent
					survived.
				</Body1>
			</Section>

			<Section
				id="sample"
				title="The sample workflow"
				lead="A claims pipeline ships with the studio so you can see every verdict without wiring up your own agents."
			>
				<Table
					aria-label="Sample workflow contracts"
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

			<Section id="faq" title="Questions">
				<Accordion collapsible multiple>
					{FAQ.map((item) => (
						<AccordionItem
							key={item.q}
							value={item.q}
						>
							<AccordionHeader>
								{item.q}
							</AccordionHeader>
							<AccordionPanel>
								<Body1>
									{item.a}
								</Body1>
							</AccordionPanel>
						</AccordionItem>
					))}
				</Accordion>
			</Section>

			<div className={styles.cta}>
				<Subtitle1 as="h2">
					Ready to see where your hand-offs break?
				</Subtitle1>
				<Body1>
					Sign in with an approved GitHub account
					and run your first perturbation pass.
				</Body1>
				<Button
					appearance="primary"
					icon={<ArrowRightRegular />}
					iconPosition="after"
					onClick={start}
				>
					{signedIn
						? "Open the studio"
						: "Sign in with GitHub"}
				</Button>
			</div>
		</>
	);
}
