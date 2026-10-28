import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
	createProject,
	deleteProject,
	listProjects,
	setCurrentProject,
	type ProjectInfo,
} from "../api/client";
import { ErrorState, LoadingState } from "../components/StateViews";

const KEY = "app-project";
const DEMO = "demo";

interface ProjectState {
	projects: ProjectInfo[];
	projectId: string;
	project: ProjectInfo | undefined;
	isDemo: boolean;
	select: (projectId: string) => void;
	reload: () => Promise<void>;
	create: (name: string) => Promise<ProjectInfo>;
	remove: (projectId: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectState | null>(null);

/** Holds the open project. Pages remount when it changes, so they always read the right data. */
export function ProjectProvider({ children }: { children: ReactNode }) {
	const [params, setParams] = useSearchParams();
	const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState(
		() =>
			params.get("project") ??
			localStorage.getItem(KEY) ??
			DEMO,
	);

	const reload = useCallback(async () => {
		setError(null);
		try {
			setProjects(await listProjects());
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Could not load projects",
			);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	// A shared link such as /app?project=p_abc selects that project once, then goes away.
	useEffect(() => {
		if (!params.has("project")) return;
		const next = new URLSearchParams(params);
		next.delete("project");
		setParams(next, { replace: true });
	}, [params, setParams]);

	const select = useCallback((projectId: string) => {
		localStorage.setItem(KEY, projectId);
		setSelected(projectId);
	}, []);

	const create = useCallback(
		async (name: string) => {
			const project = await createProject(name);
			await reload();
			select(project.projectId);
			return project;
		},
		[reload, select],
	);

	const remove = useCallback(
		async (projectId: string) => {
			await deleteProject(projectId);
			if (selected === projectId) select(DEMO);
			await reload();
		},
		[reload, select, selected],
	);

	// Falls back to the demo project when the saved one no longer exists or is not yours.
	const projectId =
		projects && projects.some((p) => p.projectId === selected)
			? selected
			: DEMO;
	setCurrentProject(projectId);

	const value = useMemo<ProjectState | null>(
		() =>
			projects
				? {
						projects,
						projectId,
						project: projects.find(
							(p) =>
								p.projectId ===
								projectId,
						),
						isDemo: projectId === DEMO,
						select,
						reload,
						create,
						remove,
					}
				: null,
		[projects, projectId, select, reload, create, remove],
	);

	if (error)
		return (
			<ErrorState
				message={error}
				onRetry={() => void reload()}
			/>
		);
	if (!value) return <LoadingState rows={4} label="Loading projects" />;
	return (
		<ProjectContext.Provider value={value}>
			{children}
		</ProjectContext.Provider>
	);
}

export function useProject(): ProjectState {
	const ctx = useContext(ProjectContext);
	if (!ctx)
		throw new Error(
			"useProject must be used inside ProjectProvider",
		);
	return ctx;
}
