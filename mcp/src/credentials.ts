import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Credential {
	token: string;
	login: string;
	/** ISO timestamp, when the gateway told us the token expires. */
	expiresAt?: string;
}

export interface CredentialStore {
	get(apiUrl: string): Promise<Credential | null>;
	set(apiUrl: string, credential: Credential): Promise<void>;
	delete(apiUrl: string): Promise<void>;
}

type FileShape = Record<string, Credential>;

/** ~/.mml/credentials.json, readable only by the current user, one entry per gateway. */
export class FileCredentialStore implements CredentialStore {
	private readonly file: string;

	constructor(private readonly dir: string) {
		this.file = join(dir, "credentials.json");
	}

	async get(apiUrl: string): Promise<Credential | null> {
		const entry = (await this.read())[apiUrl];
		return entry && typeof entry.token === "string" ? entry : null;
	}

	async set(apiUrl: string, credential: Credential): Promise<void> {
		const all = await this.read();
		all[apiUrl] = credential;
		await this.write(all);
	}

	async delete(apiUrl: string): Promise<void> {
		const all = await this.read();
		delete all[apiUrl];
		await this.write(all);
	}

	private async read(): Promise<FileShape> {
		try {
			const parsed: unknown = JSON.parse(
				await readFile(this.file, "utf8"),
			);
			return typeof parsed === "object" && parsed !== null
				? (parsed as FileShape)
				: {};
		} catch {
			return {};
		}
	}

	private async write(all: FileShape): Promise<void> {
		await mkdir(this.dir, { recursive: true, mode: 0o700 });
		// Write then rename so a crash never leaves a half-written token file.
		const tmp = `${this.file}.${process.pid}.tmp`;
		await writeFile(tmp, JSON.stringify(all, null, 2), {
			mode: 0o600,
		});
		await chmod(tmp, 0o600);
		await rename(tmp, this.file);
	}
}
