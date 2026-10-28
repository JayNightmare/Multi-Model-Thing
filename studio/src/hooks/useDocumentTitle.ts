import { useEffect } from "react";

const SUFFIX = "Contract Tester";

export function useDocumentTitle(title: string): void {
	useEffect(() => {
		document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
	}, [title]);
}
