import {
	mkdtemp,
	readFile,
	stat,
	symlink,
	writeFile,
	mkdir,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "../src/config.js";
import { FileCredentialStore } from "../src/credentials.js";
import { inferSchema } from "../src/schema.js";
import {
	WorkspaceError,
	readConfig,
	resolveWorkspace,
	scaffold,
	writeRunSummary,
} from "../src/workspace.js";

const tmp = () => mkdtemp(join(tmpdir(), "mml-test-"));

describe("resolveApiUrl", () => {
	it("defaults to the hosted gateway and strips trailing slashes", () => {
		expect(resolveApiUrl(undefined)).toBe(
			"https://gateway.nexusgit.info",
		);
		expect(resolveApiUrl("https://example.com//")).toBe(
			"https://example.com",
		);
	});

	it("allows plain http only for localhost", () => {
		expect(resolveApiUrl("http://localhost:8000")).toBe(
			"http://localhost:8000",
		);
		expect(resolveApiUrl("http://127.0.0.1:8000")).toBe(
			"http://127.0.0.1:8000",
		);
		expect(() => resolveApiUrl("http://example.com")).toThrow(
			/https/,
		);
		expect(() => resolveApiUrl("not a url")).toThrow(/valid URL/);
	});
});

describe("FileCredentialStore", () => {
	it("keeps tokens per gateway in a file only the user can read", async () => {
		const dir = await tmp();
		const store = new FileCredentialStore(join(dir, "home"));
		await store.set("https://a.test", {
			token: "mml_a",
			login: "alice",
		});
		await store.set("https://b.test", {
			token: "mml_b",
			login: "bob",
		});
		expect((await store.get("https://a.test"))?.token).toBe(
			"mml_a",
		);
		await store.delete("https://a.test");
		expect(await store.get("https://a.test")).toBeNull();
		expect((await store.get("https://b.test"))?.login).toBe("bob");

		if (process.platform !== "win32") {
			expect(
				(
					await stat(
						join(
							dir,
							"home",
							"credentials.json",
						),
					)
				).mode & 0o777,
			).toBe(0o600);
		}
	});

	it("treats a missing or corrupt file as signed out", async () => {
		const dir = await tmp();
		const store = new FileCredentialStore(dir);
		expect(await store.get("https://a.test")).toBeNull();
		await writeFile(join(dir, "credentials.json"), "not json");
		expect(await store.get("https://a.test")).toBeNull();
	});
});

describe("workspace", () => {
	it("refuses the home directory, because ~/.mml holds credentials", async () => {
		await expect(resolveWorkspace(homedir())).rejects.toThrow(
			WorkspaceError,
		);
		await expect(
			resolveWorkspace(join(await tmp(), "missing")),
		).rejects.toThrow(/does not exist/);
	});

	it("scaffolds .mml with config, README and .gitignore, and keeps existing files", async () => {
		const ws = await tmp();
		const config = {
			version: 1 as const,
			apiUrl: "https://g.test",
			projectId: "p_1",
			projectName: "Demo",
		};
		const created = await scaffold(ws, config);
		expect(created).toEqual([
			".mml/config.json",
			".mml/README.md",
			".mml/.gitignore",
		]);
		expect(await readConfig(ws)).toEqual(config);
		expect(
			await readFile(join(ws, ".mml", ".gitignore"), "utf8"),
		).toBe("runs/\ncache/\n");
		expect(
			await readFile(join(ws, ".mml", "README.md"), "utf8"),
		).toContain("never contains credentials");

		await writeFile(join(ws, ".mml", "README.md"), "mine");
		expect(await scaffold(ws, config)).toEqual([
			".mml/config.json",
		]);
		expect(
			await readFile(join(ws, ".mml", "README.md"), "utf8"),
		).toBe("mine");
	});

	it("explains how to fix a workspace that was never initialised", async () => {
		await expect(readConfig(await tmp())).rejects.toThrow(
			/mml_init/,
		);
	});

	it("rejects run ids that could escape the runs folder", async () => {
		const ws = await tmp();
		await scaffold(ws, {
			version: 1,
			apiUrl: "https://g.test",
			projectId: "p",
			projectName: "n",
		});
		await expect(
			writeRunSummary(ws, "../../evil", {}, ""),
		).rejects.toThrow(/run id/);
		await writeRunSummary(ws, "abc-123", { ok: true }, "# hi");
		expect(
			await readFile(join(ws, ".mml", "latest.md"), "utf8"),
		).toBe("# hi");
	});

	it("refuses a .mml that is a symlink to another folder", async () => {
		if (process.platform === "win32") return;
		const ws = await tmp();
		const elsewhere = await tmp();
		await symlink(elsewhere, join(ws, ".mml"));
		await expect(
			scaffold(ws, {
				version: 1,
				apiUrl: "https://g.test",
				projectId: "p",
				projectName: "n",
			}),
		).rejects.toThrow(/outside the workspace/);
		await mkdir(join(elsewhere, "x"), { recursive: true });
	});
});

describe("inferSchema", () => {
	it("derives types, required keys and forbids extras", () => {
		const schema = inferSchema([
			{ claim_id: "C-1", amount: 10, tags: ["a"], note: "x" },
			{ claim_id: "C-2", amount: 12.5, tags: ["b", "c"] },
		]);
		expect(schema).toEqual({
			type: "object",
			properties: {
				claim_id: { type: "string", minLength: 1 },
				amount: { type: "number" },
				tags: {
					type: "array",
					items: { type: "string", minLength: 1 },
					minItems: 1,
				},
				note: { type: "string", minLength: 1 },
			},
			required: ["claim_id", "amount", "tags"],
			additionalProperties: false,
		});
	});

	it("merges nested objects, nulls and mixed types", () => {
		const schema = inferSchema([
			{ a: { b: 1 }, c: null },
			{ a: { b: 2 }, c: "x" },
		]) as { properties: Record<string, unknown> };
		expect(schema.properties.a).toMatchObject({
			type: "object",
			properties: { b: { type: "integer" } },
			required: ["b"],
		});
		expect(schema.properties.c).toEqual({
			type: ["null", "string"],
		});
	});

	it("rejects empty input and non-object samples", () => {
		expect(() => inferSchema([])).toThrow(/at least one/);
		expect(() => inferSchema([1 as unknown])).toThrow(
			/JSON object/,
		);
	});
});
