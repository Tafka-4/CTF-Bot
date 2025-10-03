async function getFetch(): Promise<typeof fetch> {
	const g: any = globalThis;
	if (typeof g.fetch === "function") return g.fetch.bind(g);
	throw new Error("fetch is not available in this runtime");
}

function resolveBaseUrl(): string {
	const configured =
		process.env.REVSHELL_SERVICE_URL ||
		process.env.REVSHELL_INTERNAL_URL ||
		process.env.REVSHELL_BASE_URL;
	if (configured) {
		return configured.endsWith("/") ? configured.slice(0, -1) : configured;
	}
	const env = (process.env.NODE_ENV ?? "").toLowerCase();
	if (env === "development" || env === "dev") {
		return "http://localhost:3002";
	}
	return "http://revshell:3002";
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const fetch = await getFetch();
	const baseUrl = resolveBaseUrl();
	const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
	const res = await fetch(url, {
		...init,
		headers: {
			accept: "application/json",
			"content-type": "application/json",
			...(init?.headers ?? {}),
		},
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
}

export type RevshellPairingSummary = {
	key: string;
	ownerUserId: string | null;
	label: string | null;
	status:
		| "waiting"
		| "operator_connected"
		| "target_connected"
		| "bridged"
		| "closed";
	createdAt: string;
	lastActivityAt: string;
	operatorConnected: boolean;
	targetConnected: boolean;
	closedAt: string | null;
	closeReason: string | null;
	logCount: number;
};

export type RevshellCreateResponse = {
	pairing: RevshellPairingSummary;
	connection: {
		host: string;
		port: number;
	};
	commands: {
		operator: string;
		target: string;
	};
};

export type RevshellLogEntry = {
	seq: number;
	at: string;
	source: "operator" | "target";
	size: number;
	preview: string;
};

export async function createRevshellPairing(input: {
	ownerUserId?: string;
	label?: string;
}): Promise<RevshellCreateResponse> {
	return await apiRequest<RevshellCreateResponse>("/pairings", {
		method: "POST",
		body: JSON.stringify(input ?? {}),
	});
}

export async function listRevshellPairings(
	ownerUserId?: string
): Promise<RevshellPairingSummary[]> {
	const params = ownerUserId ? `?ownerUserId=${encodeURIComponent(ownerUserId)}` : "";
	const response = await apiRequest<{ pairings: RevshellPairingSummary[] }>(
		`/pairings${params}`
	);
	return response.pairings;
}

export async function getRevshellPairing(
	key: string
): Promise<RevshellPairingSummary> {
	const response = await apiRequest<{ pairing: RevshellPairingSummary }>(
		`/pairings/${encodeURIComponent(key)}`
	);
	return response.pairing;
}

export async function getRevshellLogs(
	key: string,
	after?: number
): Promise<{
	pairing: RevshellPairingSummary;
	logs: RevshellLogEntry[];
	currentSequence: number;
}> {
	const search = new URLSearchParams();
	if (after !== undefined) search.set("after", String(after));
	const response = await apiRequest<{
		pairing: RevshellPairingSummary;
		logs: RevshellLogEntry[];
		currentSequence: number;
	}>(
		`/pairings/${encodeURIComponent(key)}/logs${
			search.toString() ? `?${search.toString()}` : ""
		}`
	);
	return response;
}

export async function sendToRevshellPairing(input: {
	key: string;
	role?: "operator" | "target";
	text?: string;
	base64?: string;
}): Promise<{ success: true; bytesSent: number }> {
	const { key, ...body } = input;
	return await apiRequest<{ success: true; bytesSent: number }>(
		`/pairings/${encodeURIComponent(key)}/send`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function closeRevshellPairing(
	key: string
): Promise<RevshellPairingSummary> {
	const response = await apiRequest<{ pairing: RevshellPairingSummary }>(
		`/pairings/${encodeURIComponent(key)}/close`,
		{
			method: "POST",
		}
	);
	return response.pairing;
}
