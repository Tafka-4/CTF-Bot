import express, { type Request, type Response } from "express";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = express();
app.disable("x-powered-by");

const MAX_REQUESTS_PER_BIN = Number.parseInt(
	process.env.MAX_REQUESTS_PER_BIN ?? "50",
	10
);
const MAX_BODY_BYTES = Number.parseInt(
	process.env.MAX_REQUEST_BODY_BYTES ?? `${64 * 1024}`,
	10
);
const DEFAULT_BIN_TTL_MS = 30 * 60 * 1000;
const ENV_TTL = Number.parseInt(process.env.REQUESTBIN_TTL_MS ?? "", 10);
const BIN_TTL_MS =
	Number.isFinite(ENV_TTL) && ENV_TTL > 0 ? ENV_TTL : DEFAULT_BIN_TTL_MS;

export type CapturedRequest = {
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

type RequestBin = {
	id: string;
	label?: string;
	guildId?: string;
	channelId?: string;
	threadId?: string;
	requestCount: number;
	createdAt: string;
	lastRequestAt?: string;
	expiresAt: string;
	token: string;
	records: CapturedRequest[];
};

const bins = new Map<string, RequestBin>();

app.use("/api", express.json({ limit: "1mb" }));

function resolvePublicBase(): string {
	const domain = process.env.DOMAIN?.trim();
	if (!domain || domain.length === 0) {
		return `http://localhost:${PORT}`;
	}
	if (domain.startsWith("http://") || domain.startsWith("https://")) {
		return domain.replace(/\/$/, "");
	}
	return `https://reqbin.${domain}`;
}

function formatHeaders(headers: IncomingHttpHeaders): Record<string, string> {
	const formatted: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (!value) continue;
		formatted[key] = Array.isArray(value)
			? value.join(", ")
			: String(value);
	}
	return formatted;
}

function computeExpiry(): string {
	return new Date(Date.now() + BIN_TTL_MS).toISOString();
}

function summariseBin(bin: RequestBin, includeSecret = false) {
	const base = resolvePublicBase();
	const inspectBase = `${base}/api/bins/${bin.id}`;
	const summary: Record<string, unknown> = {
		id: bin.id,
		label: bin.label,
		createdAt: bin.createdAt,
		requestCount: bin.requestCount,
		lastRequestAt: bin.lastRequestAt ?? null,
		threadId: bin.threadId ?? null,
		channelId: bin.channelId ?? null,
		guildId: bin.guildId ?? null,
		endpointUrl: `${base}/r/${bin.id}`,
		expiresAt: bin.expiresAt,
		inspectUrl: includeSecret
			? `${inspectBase}?token=${bin.token}`
			: inspectBase,
	};
	if (includeSecret) {
		summary.token = bin.token;
	}
	return summary;
}

function getOptionalString(v: unknown): string | undefined {
	return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function cleanupExpiredBins() {
	const now = Date.now();
	for (const [binId, bin] of bins.entries()) {
		if (Date.parse(bin.expiresAt) <= now) {
			bins.delete(binId);
		}
	}
}

function findActiveBin(binId: string): RequestBin | undefined {
	cleanupExpiredBins();
	const bin = bins.get(binId);
	if (!bin) return undefined;
	if (Date.parse(bin.expiresAt) <= Date.now()) {
		bins.delete(binId);
		return undefined;
	}
	return bin;
}

function renewBin(bin: RequestBin) {
	bin.expiresAt = computeExpiry();
}

function extractToken(req: Request): string | undefined {
	const header = req.headers["x-requestbin-token"];
	if (typeof header === "string" && header.trim().length > 0) {
		return header.trim();
	}
	const tokenParam = req.query.token;
	if (typeof tokenParam === "string" && tokenParam.trim().length > 0) {
		return tokenParam.trim();
	}
	if (Array.isArray(tokenParam)) {
		for (const value of tokenParam) {
			if (typeof value === "string" && value.trim().length > 0) {
				return value.trim();
			}
		}
	}
	return undefined;
}

function requireAuthorizedBin(): RequestHandler {
	return (req, res, next) => {
		const { binId } = req.params as { binId: string };
		const bin = findActiveBin(binId);
		if (!bin) {
			res.status(404).json({ error: "BIN_NOT_FOUND" });
			return;
		}
		const token = extractToken(req);
		if (!token || token !== bin.token) {
			res.status(403).json({ error: "ACCESS_DENIED" });
			return;
		}
		renewBin(bin);
		(res.locals as any).bin = bin;
		next();
	};
}

async function readRawBody(req: Request) {
	return await new Promise<{
		buffer: Buffer;
		truncated: boolean;
	}>((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let truncated = false;

		req.on("data", (chunk) => {
			if (truncated) return;
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buf.length;
			if (size > MAX_BODY_BYTES) {
				truncated = true;
				const allowed = MAX_BODY_BYTES - (size - buf.length);
				if (allowed > 0) {
					chunks.push(buf.subarray(0, allowed));
				}
				return;
			}
			chunks.push(buf);
		});

		req.on("end", () => {
			resolve({ buffer: Buffer.concat(chunks), truncated });
		});

		req.on("error", (error) => reject(error));
	});
}

async function captureRequest(req: Request, res: Response) {
	const { binId } = req.params as { binId: string };
	const bin = findActiveBin(binId);
	if (!bin) {
		res.status(404).json({ error: "BIN_NOT_FOUND" });
		return;
	}

	const { buffer, truncated } = await readRawBody(req);
	const rawText = buffer.toString("utf8");
	let bodyJson: unknown;
	const rawContentType = Array.isArray(req.headers["content-type"])
		? req.headers["content-type"]?.[0]
		: req.headers["content-type"];
	const contentType =
		typeof rawContentType === "string" ? rawContentType : undefined;
	if (contentType && contentType.includes("application/json")) {
		try {
			bodyJson = JSON.parse(rawText || "null");
		} catch {
			bodyJson = undefined;
		}
	}
	const { remainder } = req.params as {
		binId: string;
		remainder?: string | string[];
	};
	const remainderPath = Array.isArray(remainder)
		? remainder.join("/")
		: remainder ?? "";
	const pathSuffix = remainderPath.length > 0 ? `/${remainderPath}` : "/";

	const clientIp =
		typeof req.ip === "string" && req.ip.length > 0
			? req.ip
			: typeof req.socket?.remoteAddress === "string"
			? req.socket.remoteAddress
			: "unknown";

	const statusCode = 200;
	const record: CapturedRequest = {
		id: crypto.randomUUID(),
		method: req.method,
		path: pathSuffix,
		fullUrl: req.originalUrl,
		query: req.query as Record<string, unknown>,
		headers: formatHeaders(req.headers),
		createdAt: new Date().toISOString(),
		ip: clientIp,
		contentLength: buffer.length,
		statusCode,
		truncated,
		...(contentType ? { contentType } : {}),
		...(rawText.length > 0 ? { bodyText: rawText } : {}),
		...(bodyJson !== undefined ? { bodyJson } : {}),
	};

	bin.records.unshift(record);
	if (bin.records.length > MAX_REQUESTS_PER_BIN) {
		bin.records.length = MAX_REQUESTS_PER_BIN;
	}
	bin.requestCount += 1;
	bin.lastRequestAt = record.createdAt;
	renewBin(bin);

	res.status(200).json({
		success: true,
		recordId: record.id,
		recordedRequests: bin.records.length,
		expiresAt: bin.expiresAt,
	});
}

app.get("/healthz", (_req, res) => {
	res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
	res.json({
		service: "CTF RequestBin",
		message:
			"Use POST /api/bins to create a new bin. Incoming requests should target /r/:binId.",
	});
});

app.post("/api/bins", (req, res) => {
	const { label, guildId, channelId, threadId } = (req.body ?? {}) as Record<
		string,
		unknown
	>;

	cleanupExpiredBins();
	const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
	const createdAt = new Date().toISOString();
	const token = crypto.randomUUID().replace(/-/g, "");
	const bin: RequestBin = {
		id,
		createdAt,
		records: [],
		requestCount: 0,
		expiresAt: computeExpiry(),
		token,
	};

	const labelValue = getOptionalString(label);
	if (labelValue) bin.label = labelValue;
	const guildValue = getOptionalString(guildId);
	if (guildValue) bin.guildId = guildValue;
	const channelValue = getOptionalString(channelId);
	if (channelValue) bin.channelId = channelValue;
	const threadValue = getOptionalString(threadId);
	if (threadValue) bin.threadId = threadValue;

	bins.set(id, bin);

	res.status(201).json(summariseBin(bin, true));
});

app.get("/api/bins/:binId", requireAuthorizedBin(), (req, res) => {
	const bin = (res.locals as any).bin as RequestBin;
	res.json({
		...summariseBin(bin, true),
		requests: bin.records,
	});
});

app.get("/api/bins/:binId/requests", requireAuthorizedBin(), (req, res) => {
	const bin = (res.locals as any).bin as RequestBin;
	const limitRaw = Array.isArray(req.query.limit)
		? req.query.limit[0]
		: req.query.limit;
	const limit = Math.max(
		1,
		Math.min(
			Number.parseInt(
				typeof limitRaw === "string" ? limitRaw : "20",
				10
			) || 20,
			MAX_REQUESTS_PER_BIN
		)
	);

	res.json({
		requests: bin.records.slice(0, limit),
		total: bin.records.length,
		bin: summariseBin(bin, true),
	});
});

app.delete("/api/bins/:binId", requireAuthorizedBin(), (req, res) => {
	const { binId } = req.params as { binId: string };
	bins.delete(binId);
	res.status(204).send();
});

app.post("/api/bins/:binId/reset", requireAuthorizedBin(), (req, res) => {
	const bin = (res.locals as any).bin as RequestBin;
	bin.records = [];
	bin.requestCount = 0;
	delete bin.lastRequestAt;
	renewBin(bin);
	res.json(summariseBin(bin, true));
});

app.all("/r/:binId", captureRequest);
app.all("/r/:binId/*remainder", captureRequest);

app.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
	console.error("RequestBin service error:", err);
	res.status(500).json({ error: "INTERNAL_ERROR" });
});

app.listen(PORT, () => {
	console.log(`RequestBin service listening on port ${PORT}`);
});
