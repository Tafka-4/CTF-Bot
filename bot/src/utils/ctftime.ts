export type CtftimeEvent = {
	id: number;
	title: string;
	url: string;
	description?: string;
	organizers?: { name?: string }[];
	ctf_url?: string;
	start?: string; // ISO
	finish?: string; // ISO
};

export function extractEventId(input: string): number | null {
	try {
		const maybeNum = Number(input);
		if (Number.isFinite(maybeNum)) return maybeNum;
	} catch {}
	try {
		const u = new URL(input);
		const parts = u.pathname.split("/").filter(Boolean);
		const idx = parts.findIndex((p) => p === "event");
		if (idx !== -1 && parts[idx + 1]) {
			const idNum = Number(parts[idx + 1]);
			if (Number.isFinite(idNum)) return idNum;
		}
	} catch {}
	return null;
}

async function getFetch(): Promise<(...args: any[]) => Promise<any>> {
	const g: any = globalThis as any;
	if (typeof g.fetch === "function") return g.fetch.bind(g);
	throw new Error("fetch is not available in this runtime");
}

export async function fetchCtftimeEvent(
	eventIdOrUrl: string
): Promise<CtftimeEvent | null> {
	const id = extractEventId(eventIdOrUrl);
	if (!id) return null;
	const api = `https://ctftime.org/api/v1/events/${id}/`;
	const fetch = await getFetch();
	const res = await fetch(api, { headers: { accept: "application/json" } });
	if (!res.ok) return null;
	const data = (await res.json()) as any;
	return {
		id: Number(data?.id ?? id),
		title: String(data?.title ?? ""),
		url: String(data?.url ?? `https://ctftime.org/event/${id}`),
		description:
			typeof data?.description === "string"
				? data.description
				: undefined,
		organizers: Array.isArray(data?.organizers)
			? data.organizers
			: undefined,
		ctf_url: typeof data?.ctf_url === "string" ? data.ctf_url : undefined,
		start: typeof data?.start === "string" ? data.start : undefined,
		finish: typeof data?.finish === "string" ? data.finish : undefined,
	};
}

export function ctftimeToQueueItem(ev: CtftimeEvent) {
	const startAt = ev.start ? new Date(ev.start).toISOString() : undefined;
	const desc = ev.description?.slice(0, 1000) || "";
	const url = ev.ctf_url || ev.url;
	return {
		name: ev.title,
		url,
		description: desc,
		createdAt: new Date().toISOString(),
		startAt,
		started: false,
	} as any;
}

function toIsoNow() {
	return new Date().toISOString();
}

function buildQuery(params: Record<string, string | number | undefined>) {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined) continue;
		sp.set(k, String(v));
	}
	return sp.toString();
}

export type CtftimeTimeframe = "upcoming" | "running" | "archive";

export async function fetchCtftimeEventsByTimeframe(
	timeframe: CtftimeTimeframe,
	limit = 200
): Promise<CtftimeEvent[]> {
	const fetch = await getFetch();
	const now = toIsoNow();
	let qs: string;
	if (timeframe === "upcoming") {
		qs = buildQuery({ limit, finish__gte: now });
	} else if (timeframe === "running") {
		qs = buildQuery({ limit, start__lte: now, finish__gte: now });
	} else {
		qs = buildQuery({ limit, finish__lte: now });
	}
	const url = `https://ctftime.org/api/v1/events/?${qs}`;
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) return [];
	const arr = (await res.json()) as any[];
	return (arr || []).map((data: any) => ({
		id: Number(data?.id ?? 0),
		title: String(data?.title ?? ""),
		url: String(data?.url ?? ""),
		description:
			typeof data?.description === "string"
				? data.description
				: undefined,
		organizers: Array.isArray(data?.organizers)
			? data.organizers
			: undefined,
		ctf_url: typeof data?.ctf_url === "string" ? data.ctf_url : undefined,
		start: typeof data?.start === "string" ? data.start : undefined,
		finish: typeof data?.finish === "string" ? data.finish : undefined,
	}));
}

export async function searchCtftimeEvents(
	query: string,
	timeframe: CtftimeTimeframe,
	page: number,
	pageSize: number
) {
	const all = await fetchCtftimeEventsByTimeframe(timeframe, 200);
	const q = query.trim().toLowerCase();
	const filtered = all.filter((e) =>
		[e.title, e.url, e.description || "", e.ctf_url || ""].some((s) =>
			String(s).toLowerCase().includes(q)
		)
	);
	const total = filtered.length;
	const start = page * pageSize;
	const items = filtered.slice(start, start + pageSize);
	return { total, items };
}
