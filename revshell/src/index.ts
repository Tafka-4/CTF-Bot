import dotenv from "dotenv";

import { loadConfig } from "./config.js";
import { createHttpServer } from "./http/api.js";
import { PairingStore } from "./pairingStore.js";
import { createTcpListener } from "./tcp/listener.js";

dotenv.config();

const config = loadConfig(process.env);

const store = new PairingStore(config.maxBufferSize);

console.log("Reverse shell config", {
	httpPort: config.httpPort,
	shellPort: config.shellPort,
	maxBufferSize: config.maxBufferSize,
	authTimeoutMs: config.authTimeoutMs,
	maxHandshakeBytes: config.maxHandshakeBytes,
	pairingTtlMs: config.pairingTtlMs,
	closedRetentionMs: config.closedRetentionMs,
});

const { server: httpServer } = createHttpServer({
	store,
	httpHost: config.httpHost,
	httpPort: config.httpPort,
	accessHostname: config.accessHostname,
	accessPort: config.accessPort,
	accessUseTls: config.accessUseTls,
	statusSummary: () => store.statusSummary(),
});

const tcpServer = createTcpListener({
	store,
	shellHost: config.shellHost,
	shellPort: config.shellPort,
	authTimeoutMs: config.authTimeoutMs,
	maxHandshakeBytes: config.maxHandshakeBytes,
});

setInterval(() => {
	store.cleanup(config.pairingTtlMs, config.closedRetentionMs);
}, 30_000).unref();

function shutdown(signal: string) {
	console.log(`Received ${signal}, beginning graceful shutdown`);
	httpServer.close(() => console.log("HTTP server closed"));
	tcpServer.close(() => console.log("TCP listener closed"));
	for (const summary of store.list()) {
		store.close(summary.key, `shutdown:${signal}`);
	}
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
