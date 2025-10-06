import express, { Router } from "express";

import type { NextFunction, Request, Response } from "express";

import type { PairingRole, PairingStore } from "../pairingStore.js";

export type HttpServerConfig = {
	httpHost: string;
	httpPort: number;
	tunnelHostname?: string;
	tunnelPublicPort: number;
	statusSummary: () => { active: number; total: number };
	store: PairingStore;
};

export function createHttpServer(config: HttpServerConfig) {
	const app = express();
	app.disable("x-powered-by");
	app.use(express.json({ limit: "512kb" }));

	app.use((req, res, next) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		next();
	});

	const router = Router();

	router.post("/", (req, res) => {
		const { ownerUserId, label } = (req.body ?? {}) as {
			ownerUserId?: string;
			label?: string;
		};
		const pairing = config.store.create({
			...(ownerUserId !== undefined ? { ownerUserId } : {}),
			...(label !== undefined ? { label } : {}),
		});
		const hostCandidate =
			config.tunnelHostname ?? process.env.DOMAIN ?? "127.0.0.1";
		const portCandidate = config.tunnelPublicPort;
		const commands = config.store.buildCommandExamples(
			pairing.key,
			hostCandidate,
			portCandidate
		);
		res.status(201).json({
			pairing,
			connection: {
				host: hostCandidate,
				port: portCandidate,
			},
			commands,
		});
	});

	router.get("/", (req, res) => {
		const { ownerUserId } = req.query as { ownerUserId?: string };
		const pairings = config.store.list(ownerUserId);
		res.json({ pairings });
	});

	router.get("/:key", (req, res) => {
		const pairing = config.store.getSummary(req.params.key);
		if (!pairing) {
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
		res.json({ pairing });
	});

	router.get("/:key/logs", (req, res) => {
		const after = Number.parseInt(String(req.query.after ?? "0"), 10) || 0;
		const result = config.store.getLogs(req.params.key, after);
		if (!result) {
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
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
		if (role !== "operator" && role !== "target") {
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
			res.status(400).json({ error: "MISSING_PAYLOAD" });
			return;
		}
		const sendResult = config.store.send(req.params.key, role, payload);
		if (!sendResult.ok) {
			res.status(sendResult.status).json({
				error: sendResult.error ?? "UNKNOWN_ERROR",
			});
			return;
		}
		res.json({ success: true, bytesSent: payload.length });
	});

	router.post("/:key/close", (req, res) => {
		const summary = config.store.getSummary(req.params.key);
		if (!summary) {
			res.status(404).json({ error: "PAIRING_NOT_FOUND" });
			return;
		}
		config.store.close(req.params.key, "closed-by-request");
		res.json({ pairing: config.store.getSummary(req.params.key) });
	});

	app.use("/pairings", router);

	app.get("/healthz", (_req, res) => {
		const summary = config.statusSummary();
		res.json({ status: "ok", ...summary });
	});

	app.get("/", (_req, res) => {
		const host = config.tunnelHostname ?? process.env.DOMAIN ?? "127.0.0.1";
		res.json({
			service: "CTF Reverse Shell Relay",
			description:
				"Pairs operator and target clients using a session key and relays traffic.",
			listener: {
				host,
				port: config.tunnelPublicPort,
			},
		});
	});

	app.use(
		(error: unknown, _req: Request, res: Response, next: NextFunction) => {
			if (res.headersSent) {
				next(error);
				return;
			}
			console.error("Unhandled error in reverse shell API:", error);
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
