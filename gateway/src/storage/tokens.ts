import { ISO, type Db } from "./db.js";

export interface TokenInfo {
	tokenId: string;
	clientName: string;
	createdAt: string;
	lastUsedAt: string | null;
	expiresAt: string;
}

export interface StoredToken {
	tokenId: string;
	login: string;
	expiresAt: Date;
	revoked: boolean;
}

export class TokenRepo {
	constructor(private readonly db: Db) {}

	async create(token: {
		tokenId: string;
		tokenHash: string;
		login: string;
		clientName: string;
		expiresAt: Date;
	}): Promise<void> {
		await this.db.exec(
			"INSERT INTO api_tokens (token_id, token_hash, login, client_name, created_at, expires_at) VALUES (?, ?, ?, ?, CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP))",
			[
				token.tokenId,
				token.tokenHash,
				token.login,
				token.clientName,
				new Date().toISOString(),
				token.expiresAt.toISOString(),
			],
		);
	}

	async findByHash(tokenHash: string): Promise<StoredToken | null> {
		const [row] = await this.db.query(
			`SELECT token_id, login, strftime(expires_at, ${ISO}) AS expires_at, revoked_at IS NOT NULL AS revoked
       FROM api_tokens WHERE token_hash = ?`,
			[tokenHash],
		);
		return row
			? {
					tokenId: String(row.token_id),
					login: String(row.login),
					expiresAt: new Date(
						String(row.expires_at),
					),
					revoked: Boolean(row.revoked),
				}
			: null;
	}

	async touch(tokenId: string): Promise<void> {
		await this.db.exec(
			"UPDATE api_tokens SET last_used_at = CAST(? AS TIMESTAMP) WHERE token_id = ?",
			[new Date().toISOString(), tokenId],
		);
	}

	async list(login: string): Promise<TokenInfo[]> {
		const rows = await this.db.query(
			`SELECT token_id, client_name, strftime(created_at, ${ISO}) AS created_at,
              strftime(last_used_at, ${ISO}) AS last_used_at, strftime(expires_at, ${ISO}) AS expires_at
       FROM api_tokens
       WHERE login = ? AND revoked_at IS NULL AND expires_at > CAST(? AS TIMESTAMP)
       ORDER BY created_at DESC`,
			[login, new Date().toISOString()],
		);
		return rows.map((r) => ({
			tokenId: String(r.token_id),
			clientName: String(r.client_name),
			createdAt: String(r.created_at),
			lastUsedAt: (r.last_used_at as string | null) ?? null,
			expiresAt: String(r.expires_at),
		}));
	}

	/** Returns false when the token does not exist or belongs to someone else. */
	async revoke(login: string, tokenId: string): Promise<boolean> {
		const [row] = await this.db.query(
			"SELECT token_id FROM api_tokens WHERE token_id = ? AND login = ? AND revoked_at IS NULL",
			[tokenId, login],
		);
		if (!row) return false;
		await this.db.exec(
			"UPDATE api_tokens SET revoked_at = CAST(? AS TIMESTAMP) WHERE token_id = ?",
			[new Date().toISOString(), tokenId],
		);
		return true;
	}
}
