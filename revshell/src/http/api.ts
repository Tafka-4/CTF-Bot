import express, { Router } from "express";

import type { NextFunction, Request, Response } from "express";

import type { PairingRole, PairingStore } from "../pairingStore.js";

export type HttpServerConfig = {
	httpHost: string;
	httpPort: number;
	accessHostname: string;
	accessPort: number;
	accessUseTls: boolean;
	statusSummary: () => { active: number; total: number };
	store: PairingStore;
};

let requestSequence = 0;

function nextRequestId() {
	requestSequence += 1;
	return `req-${requestSequence}`;
}

function getRequestId(res: Response) {
	return (res.locals?.requestId as string | undefined) ?? "req-unknown";
}

export function createHttpServer(config: HttpServerConfig) {
	const app = express();
	app.disable("x-powered-by");
	app.use(express.json({ limit: "512kb" }));

	app.use((req, res, next) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		next();
	});

	app.use((req, res, next) => {
		const requestId = nextRequestId();
		const start = Date.now();
		res.locals.requestId = requestId;
		const length = req.headers["content-length"];
		console.log("[HTTP]", requestId, "incoming", {
			method: req.method,
			path: req.originalUrl,
			ip: req.ip,
			contentLength: length ? Number.parseInt(length, 10) || length : 0,
		});
		res.on("finish", () => {
			console.log("[HTTP]", requestId, "completed", {
				statusCode: res.statusCode,
				statusMessage: res.statusMessage,
				durationMs: Date.now() - start,
			});
		});
		res.on("close", () => {
			if (!res.writableEnded) {
				console.warn("[HTTP]", requestId, "connection closed before response ended");
			}
		});
		next();
	});

	const router = Router();

	router.post("/", (req, res) => {
		const { ownerUserId, label } = (req.body ?? {}) as {
			ownerUserId?: string;
			label?: string;
		};
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "create pairing request", {
			ownerUserId: ownerUserId ?? null,
			label: label ?? null,
		});
		const pairing = config.store.create({
			...(ownerUserId !== undefined ? { ownerUserId } : {}),
			...(label !== undefined ? { label } : {}),
		});
		console.log("[HTTP]", requestId, "create pairing success", {
			key: pairing.key,
			status: pairing.status,
		});
		const hostCandidate = config.accessHostname;
		const portCandidate = config.accessPort;
		const commands = config.store.buildCommandExamples(pairing.key, {
			host: hostCandidate,
			port: portCandidate,
			preferTls: config.accessUseTls,
		});
		res.status(201).json({
			pairing,
			connection: {
				host: hostCandidate,
				port: portCandidate,
				useTls: config.accessUseTls,
			},
			commands,
		});
	});

	router.get("/", (req, res) => {
		const { ownerUserId } = req.query as { ownerUserId?: string };
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "list pairings", {
			ownerUserId: ownerUserId ?? null,
		});
		const pairings = config.store.list(ownerUserId);
		console.log("[HTTP]", requestId, "list pairings success", {
			count: pairings.length,
		});
		res.json({ pairings });
	});

	router.get("/:key", (req, res) => {
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "get pairing", { key: req.params.key });
		const pairing = config.store.getSummary(req.params.key);
		if (!pairing) {
			console.warn("[HTTP]", requestId, "get pairing not found", {
				key: req.params.key,
			});
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
		console.log("[HTTP]", requestId, "get pairing success", {
			key: pairing.key,
			status: pairing.status,
		});
		res.json({ pairing });
	});

	router.get("/:key/logs", (req, res) => {
		const after = Number.parseInt(String(req.query.after ?? "0"), 10) || 0;
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "get logs", {
			key: req.params.key,
			after,
		});
		const result = config.store.getLogs(req.params.key, after);
		if (!result) {
			console.warn("[HTTP]", requestId, "get logs not found", {
				key: req.params.key,
			});
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
		console.log("[HTTP]", requestId, "get logs success", {
			key: result.pairing.key,
			entries: result.logs.length,
			currentSequence: result.currentSequence,
		});
		res.json(result);
	});

	router.post("/:key/send", (req, res) => {
		const {
			role = "operator",
			text,
			base64,
		} = (req.body ?? {}) as {
			role?: PairingRole;
			text?: string;
			base64?: string;
		};
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "send payload", {
			key: req.params.key,
			role,
			hasText: typeof text === "string" && text.length > 0,
			hasBase64: typeof base64 === "string" && base64.length > 0,
		});
		if (role !== "operator" && role !== "target") {
			console.warn("[HTTP]", requestId, "send payload invalid role", {
				role,
			});
			res.status(400).json({ error: "INVALID_ROLE" });
			return;
		}
		const payload =
			typeof text === "string" && text.length > 0
				? Buffer.from(text, "utf8")
				: typeof base64 === "string" && base64.length > 0
				? Buffer.from(base64, "base64")
				: null;
		if (!payload) {
			console.warn("[HTTP]", requestId, "send payload missing", {
				key: req.params.key,
			});
			res.status(400).json({ error: "MISSING_PAYLOAD" });
			return;
		}
		const sendResult = config.store.send(req.params.key, role, payload);
		if (!sendResult.ok) {
			console.warn("[HTTP]", requestId, "send payload failed", {
				key: req.params.key,
				role,
				error: sendResult.error,
				status: sendResult.status,
			});
			res.status(sendResult.status).json({
				error: sendResult.error ?? "UNKNOWN_ERROR",
			});
			return;
		}
		console.log("[HTTP]", requestId, "send payload success", {
			key: req.params.key,
			role,
			bytesSent: payload.length,
		});
		res.json({ success: true, bytesSent: payload.length });
	});

	router.post("/:key/close", (req, res) => {
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "close pairing request", {
			key: req.params.key,
		});
		const summary = config.store.getSummary(req.params.key);
		if (!summary) {
			console.warn("[HTTP]", requestId, "close pairing not found", {
				key: req.params.key,
			});
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
		config.store.close(req.params.key, "closed-by-request");
		console.log("[HTTP]", requestId, "close pairing success", {
			key: req.params.key,
		});
		res.json({ pairing: config.store.getSummary(req.params.key) });
	});

	app.use("/pairings", router);

	app.get("/healthz", (_req, res) => {
		const summary = config.statusSummary();
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "healthz", summary);
		res.json({ status: "ok", ...summary });
	});

	app.get("/", (_req, res) => {
		const host = config.accessHostname;
		const requestId = getRequestId(res);
		console.log("[HTTP]", requestId, "root metadata");
		res.json({
			service: "CTF Reverse Shell Relay",
			description:
				"Pairs operator and target clients using a session key and relays traffic.",
			listener: {
				host,
				port: config.accessPort,
				useTls: config.accessUseTls,
			},
		});
	});

	app.use(
		(error: unknown, _req: Request, res: Response, next: NextFunction) => {
			if (res.headersSent) {
				next(error);
				return;
			}
			const requestId = getRequestId(res);
			console.error(
				"[HTTP]",
				requestId,
				"unhandled error in reverse shell API:",
				error
			);
			res.status(500).json({ error: "INTERNAL_ERROR" });
		}
	);

	const server = app.listen(config.httpPort, config.httpHost, () => {
		console.log(
			`Reverse shell API listening on ${config.httpHost}:${config.httpPort}`
		);
	});

	return { app, server };
}
