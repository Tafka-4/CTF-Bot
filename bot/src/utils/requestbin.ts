import { URL } from "node:url";

export class RequestBinApiError extends Error {
	constructor(public status: number, message: string) {
		super(message);
		this.name = "RequestBinApiError";
	}
}

export type RequestBinSummary = {
	id: string;
	label?: string | null;
	createdAt: string;
	expiresAt: string;
	requestCount: number;
	lastRequestAt: string | null;
	threadId: string | null;
	channelId: string | null;
	guildId: string | null;
	endpointUrl: string;
	inspectUrl: string;
	token?: string | null;
};

export type RequestBinRequest = {
	id: string;
	method: string;
	path: string;
	fullUrl: string;
	query: Record<string, unknown>;
	headers: Record<string, string>;
	createdAt: string;
	ip: string;
	contentLength: number;
	statusCode: number;
	contentType?: string;
	bodyText?: string;
	bodyJson?: unknown;
	truncated: boolean;
};

export type RequestBinRequestsResponse = {
	requests: RequestBinRequest[];
	total: number;
	bin: RequestBinSummary;
};

export type CreateRequestBinInput = {
	label?: string;
	guildId?: string;
	channelId?: string;
	threadId?: string;
	userId?: string;
};

function getServiceBaseUrl(): string {
	const configured =
		process.env.REQUESTBIN_SERVICE_URL ||
		process.env.REQUESTBIN_INTERNAL_URL ||
		process.env.REQUESTBIN_BASE_URL;

	if (configured) {
		return configured.endsWith("/") ? configured.slice(0, -1) : configured;
	}

	const env = (process.env.NODE_ENV ?? "").toLowerCase();
	if (env === "development" || env === "dev") {
		return "http://localhost:3000";
	}

	return "http://requestbin:3000";
}

async function getFetch(): Promise<typeof fetch> {
	const g: any = globalThis;
	if (typeof g.fetch === "function") return g.fetch.bind(g);
	throw new Error("fetch is not available in this runtime");
}

type FetchInit = Parameters<typeof fetch>[1];

async function apiRequest<T>(path: string, init?: FetchInit): Promise<T> {
	const fetch = await getFetch();
	const base = getServiceBaseUrl();
	const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
	const response = await fetch(url, {
		...init,
		headers: {
			accept: "application/json",
			...(init?.headers ?? {}),
		},
	});
	if (!response.ok) {
		let message = await response.text().catch(() => "");
		if (message.length > 500) {
			message = `${message.slice(0, 500)}…`;
		}
		throw new RequestBinApiError(
			response.status,
			`RequestBin API ${response.status} ${response.statusText}: ${message}`
		);
	}
	if (response.status === 204) {
		return undefined as unknown as T;
	}
	return (await response.json()) as T;
}

export async function createRequestBin(
	input: CreateRequestBinInput
): Promise<RequestBinSummary> {
	const payload: Record<string, string> = {};
	if (input.label) payload.label = input.label;
	if (input.guildId) payload.guildId = input.guildId;
	if (input.channelId) payload.channelId = input.channelId;
	if (input.threadId) payload.threadId = input.threadId;
	if (input.userId) payload.userId = input.userId;

	return await apiRequest<RequestBinSummary>("/api/bins", {
		method: "POST",
		body: JSON.stringify(payload),
		headers: { "content-type": "application/json" },
	});
}

export async function getRequestBinRequests(
	binId: string,
	token: string,
	limit = 5
): Promise<RequestBinRequestsResponse> {
	const params = new URLSearchParams();
	params.set("limit", String(Math.max(1, Math.min(limit, 50))));
	params.set("token", token);
	return await apiRequest<RequestBinRequestsResponse>(
		`/api/bins/${encodeURIComponent(binId)}/requests?${params.toString()}`
	);
}

export async function deleteRequestBin(
	binId: string,
	token: string
): Promise<void> {
	await apiRequest(
		`/api/bins/${encodeURIComponent(binId)}?token=${encodeURIComponent(
			token
		)}`,
		{
			method: "DELETE",
		}
	);
}

export async function getRequestBin(
	binId: string,
	token: string
): Promise<RequestBinSummary> {
	return await apiRequest<RequestBinSummary>(
		`/api/bins/${encodeURIComponent(binId)}?token=${encodeURIComponent(
			token
		)}`
	);
}
