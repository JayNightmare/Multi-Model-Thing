import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncStatus = "loading" | "error" | "ready";

export interface AsyncResult<T> {
	status: AsyncStatus;
	data: T | undefined;
	error: string | null;
	reload: () => void;
}

export function useAsync<T>(
	load: () => Promise<T>,
	deps: readonly unknown[] = [],
): AsyncResult<T> {
	const [state, setState] = useState<{
		status: AsyncStatus;
		data: T | undefined;
		error: string | null;
	}>({
		status: "loading",
		data: undefined,
		error: null,
	});
	const [version, setVersion] = useState(0);
	const loadRef = useRef(load);
	loadRef.current = load;

	useEffect(() => {
		let cancelled = false;
		setState((prev) => ({
			...prev,
			status: "loading",
			error: null,
		}));
		loadRef.current().then(
			(data) =>
				!cancelled &&
				setState({
					status: "ready",
					data,
					error: null,
				}),
			(err: unknown) =>
				!cancelled &&
				setState({
					status: "error",
					data: undefined,
					error:
						err instanceof Error
							? err.message
							: String(err),
				}),
		);
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [version, ...deps]);

	const reload = useCallback(() => setVersion((v) => v + 1), []);
	return { ...state, reload };
}
