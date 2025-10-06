import { setTimeout as delay } from "node:timers/promises";

import type {
	RevshellCreateResponse,
	RevshellLogEntry,
	RevshellPairingSummary,
	RevshellSendInput,
	RevshellSendResponse,
} from "./types.js";

async function getFetch(): Promise<typeof fetch> {
	const g: any = globalThis;
	if (typeof g.fetch === "function") return g.fetch.bind(g);
	throw new Error("fetch is not available in this runtime");
}

function normaliseBaseUrl(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveBaseUrl(): string {
	const configured = [
		process.env.REVSHELL_HTTP_BASE_URL,
		process.env.REVSHELL_HTTP_URL,
		process.env.REVSHELL_SERVICE_URL,
		process.env.REVSHELL_INTERNAL_URL,
		process.env.REVSHELL_BASE_URL,
	]
		.map((value) => value?.trim())
		.find((value) => value && value.length > 0);
	if (configured) return normaliseBaseUrl(configured);
	const env = (process.env.NODE_ENV ?? "").toLowerCase();
	if (env === "development" || env === "dev") return "http://localhost:8000";
	return "http://revshell:8000";
}

function buildUrl(baseUrl: string, path: string): string {
	return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

type ApiRequestOptions = RequestInit & {
	retryCount?: number;
	retryDelayMs?: number;
};

async function apiRequest<T>(
	path: string,
	init?: ApiRequestOptions
): Promise<T> {
	const fetch = await getFetch();
	const baseUrl = resolveBaseUrl();
	const url = buildUrl(baseUrl, path);
	const retryCount = init?.retryCount ?? 0;
	const retryDelayMs = init?.retryDelayMs ?? 0;
	const headers = {
		accept: "application/json",
		"content-type": "application/json",
		...(init?.headers ?? {}),
	};

	let lastError: unknown;
	for (let attempt = 0; attempt <= retryCount; attempt += 1) {
		try {
			const res = await fetch(url, {
				...init,
				headers,
			});
			if (!res.ok) {
				let message = await res.text().catch(() => "");
				if (message.length > 500) message = `${message.slice(0, 500)}…`;
				throw new Error(
					`Revshell API ${res.status} ${res.statusText}: ${
						message || "(empty)"
					}`
				);
			}
			if (res.status === 204) {
				return undefined as unknown as T;
			}
			return (await res.json()) as T;
		} catch (error) {
			lastError = error;
			if (attempt >= retryCount) break;
			if (retryDelayMs > 0)
				await delay(retryDelayMs, undefined, { ref: false });
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error(`Revshell API request failed: ${String(lastError)}`);
}

export type RevshellClientOptions = {
	defaultRetryCount?: number;
	defaultRetryDelayMs?: number;
};

export class RevshellClient {
	private readonly retryCount: number;

	private readonly retryDelayMs: number;

	constructor(options?: RevshellClientOptions) {
		this.retryCount = options?.defaultRetryCount ?? 1;
		this.retryDelayMs = options?.defaultRetryDelayMs ?? 250;
	}

	async createPairing(input: {
		ownerUserId?: string;
		label?: string;
	}): Promise<RevshellCreateResponse> {
		return await apiRequest<RevshellCreateResponse>("/pairings", {
			method: "POST",
			body: JSON.stringify(input ?? {}),
			retryCount: this.retryCount,
			retryDelayMs: this.retryDelayMs,
		});
	}

	async listPairings(
		ownerUserId?: string
	): Promise<RevshellPairingSummary[]> {
		const params = ownerUserId
			? `?ownerUserId=${encodeURIComponent(ownerUserId)}`
			: "";
		const response = await apiRequest<{
			pairings: RevshellPairingSummary[];
		}>(`/pairings${params}`, {
			retryCount: this.retryCount,
			retryDelayMs: this.retryDelayMs,
		});
		return response.pairings;
	}

	async getPairing(key: string): Promise<RevshellPairingSummary> {
		const response = await apiRequest<{ pairing: RevshellPairingSummary }>(
			`/pairings/${encodeURIComponent(key)}`,
			{
				retryCount: this.retryCount,
				retryDelayMs: this.retryDelayMs,
			}
		);
		return response.pairing;
	}

	async getLogs(
		key: string,
		after?: number
	): Promise<{
		pairing: RevshellPairingSummary;
		logs: RevshellLogEntry[];
		currentSequence: number;
	}> {
		const search = new URLSearchParams();
		if (after !== undefined) search.set("after", String(after));
		return await apiRequest(
			`/pairings/${encodeURIComponent(key)}/logs${
				search.size > 0 ? `?${search.toString()}` : ""
			}`,
			{
				retryCount: this.retryCount,
				retryDelayMs: this.retryDelayMs,
			}
		);
	}

	async send(input: RevshellSendInput): Promise<RevshellSendResponse> {
		const { key, ...body } = input;
		return await apiRequest(`/pairings/${encodeURIComponent(key)}/send`, {
			method: "POST",
			body: JSON.stringify(body),
			retryCount: this.retryCount,
			retryDelayMs: this.retryDelayMs,
		});
	}

	async close(key: string): Promise<RevshellPairingSummary> {
		const response = await apiRequest<{ pairing: RevshellPairingSummary }>(
			`/pairings/${encodeURIComponent(key)}/close`,
			{
				method: "POST",
				retryCount: this.retryCount,
				retryDelayMs: this.retryDelayMs,
			}
		);
		return response.pairing;
	}
}

export const defaultRevshellClient = new RevshellClient();

export async function createRevshellPairing(input: {
	ownerUserId?: string;
	label?: string;
}): Promise<RevshellCreateResponse> {
	return await defaultRevshellClient.createPairing(input);
}

export async function listRevshellPairings(
	ownerUserId?: string
): Promise<RevshellPairingSummary[]> {
	return await defaultRevshellClient.listPairings(ownerUserId);
}

export async function getRevshellPairing(
	key: string
): Promise<RevshellPairingSummary> {
	return await defaultRevshellClient.getPairing(key);
}

export async function getRevshellLogs(
	key: string,
	after?: number
): Promise<{
	pairing: RevshellPairingSummary;
	logs: RevshellLogEntry[];
	currentSequence: number;
}> {
	return await defaultRevshellClient.getLogs(key, after);
}

export async function sendToRevshellPairing(
	input: RevshellSendInput
): Promise<RevshellSendResponse> {
	return await defaultRevshellClient.send(input);
}

export async function closeRevshellPairing(
	key: string
): Promise<RevshellPairingSummary> {
	return await defaultRevshellClient.close(key);
}
