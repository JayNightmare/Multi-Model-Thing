import type { ApiClient } from "./types";
import { liveClient } from "./client";

export const api: ApiClient = liveClient;
export type { ApiClient } from "./types";
