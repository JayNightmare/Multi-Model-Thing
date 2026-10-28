import {
	Body1,
	Link as FluentLink,
	Skeleton,
	SkeletonItem,
	Title1,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { PRIVACY_URL, TERMS_URL } from "../lib/routes";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: "12px",
		padding: "32px 0",
	},
	frameWrap: {
		position: "relative",
		height: "calc(100vh - 260px)",
		minHeight: "520px",
		borderRadius: tokens.borderRadiusLarge,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground1,
	},
	skeleton: {
		position: "absolute",
		inset: 0,
		padding: "24px",
		display: "grid",
		gap: "12px",
		alignContent: "start",
	},
	frame: {
		position: "absolute",
		inset: 0,
		width: "100%",
		height: "100%",
		border: 0,
	},
});

function LegalPage({ title, url }: { title: string; url: string }) {
	const styles = useStyles();
	const [loaded, setLoaded] = useState(false);
	useDocumentTitle(title);

	return (
		<div className={styles.root}>
			<Title1 as="h1">{title}</Title1>
			<div className={styles.frameWrap}>
				{loaded ? null : (
					<Skeleton
						aria-label={`Loading ${title}`}
						className={styles.skeleton}
					>
						{Array.from(
							{ length: 6 },
							(_, i) => (
								<SkeletonItem
									key={i}
									size={
										i ===
										0
											? 28
											: 16
									}
								/>
							),
						)}
					</Skeleton>
				)}
				<iframe
					className={styles.frame}
					src={url}
					title={title}
					referrerPolicy="no-referrer"
					sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
					onLoad={() => setLoaded(true)}
				/>
			</div>
			<Body1>
				Not displaying?{" "}
				<FluentLink
					href={url}
					target="_blank"
					rel="noopener noreferrer"
				>
					Open the {title} in a new tab
				</FluentLink>
				.
			</Body1>
		</div>
	);
}

export function Terms() {
	return <LegalPage title="Terms of Service" url={TERMS_URL} />;
}

export function Privacy() {
	return <LegalPage title="Privacy Policy" url={PRIVACY_URL} />;
}
