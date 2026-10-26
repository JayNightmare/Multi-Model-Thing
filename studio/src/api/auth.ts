const TOKEN_KEY = "gateway.token";
export const AUTH_EXPIRED_EVENT = "gateway:auth-expired";

export function getToken(): string | null {
	return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
	sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	sessionStorage.removeItem(TOKEN_KEY);
}

export function notifyAuthExpired(): void {
	clearToken();
	window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
