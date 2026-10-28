export const ROUTES = {
	home: "/",
	how: "/how-it-works",
	terms: "/terms",
	privacy: "/privacy",
	signIn: "/signin",
	app: "/app",
	edges: "/app/edges",
	edge: (edgeId: string) => `/app/edges/${edgeId}`,
	events: "/app/events",
	report: "/app/report",
	account: "/app/account",
	projects: "/app/projects",
	/** Guide for connecting your own agents through the MCP server. */
	connectGuide: "/app/connect",
	/** Where a signed-in user approves an MCP sign-in request. */
	connect: "/connect",
} as const;

export const TERMS_URL =
	"https://terms-and-privacy.nexusgit.info/websites/nexusgit/terms";
export const PRIVACY_URL =
	"https://terms-and-privacy.nexusgit.info/websites/nexusgit/privacy";

/** Only in-app paths are honoured after sign-in, so `next` cannot redirect to another site. */
export function safeNext(next: string | null | undefined): string {
	if (
		!next ||
		!/^\/(app|connect)(\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(\?[^#]*)?$/.test(
			next,
		) ||
		next.includes("//") ||
		next.includes("\\")
	) {
		return ROUTES.app;
	}
	return next;
}
