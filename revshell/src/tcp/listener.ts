import net from "node:net";

import type { PairingRole, PairingStore } from "../pairingStore.js";

export type TcpListenerConfig = {
	shellHost: string;
	shellPort: number;
	store: PairingStore;
	authTimeoutMs?: number;
	maxHandshakeBytes?: number;
};

export function createTcpListener(config: TcpListenerConfig) {
	const authTimeoutMs = config.authTimeoutMs ?? 10_000;
	const maxHandshakeBytes = config.maxHandshakeBytes ?? 2048;

	const server = net.createServer((socket) => {
		socket.setKeepAlive(true, 30_000);
		socket.setNoDelay(true);
		let handshakeComplete = false;
		let pairingKey: string | null = null;
		let role: PairingRole | null = null;
		let buffer = Buffer.alloc(0);
		const authTimeout = setTimeout(() => {
			socket.destroy();
		}, authTimeoutMs);

		const cleanup = () => {
			clearTimeout(authTimeout);
		};

		socket.on("data", (chunk: Buffer) => {
			if (!handshakeComplete) {
				buffer = Buffer.concat([buffer, chunk]);
				if (buffer.length > maxHandshakeBytes) {
					socket.destroy();
					return;
				}
				const newlineIndex = buffer.indexOf(0x0a);
				if (newlineIndex === -1) {
					return;
				}
				const line = buffer
					.slice(0, newlineIndex)
					.toString("utf8")
					.trim();
				const remaining = buffer.slice(newlineIndex + 1);
				buffer = Buffer.alloc(0);
				const parts = line.split(/\s+/);
				const keyword = (parts[0] ?? "").toUpperCase();
				const keyValue = parts[1];
				if (keyword !== "AUTH" || !keyValue) {
					socket.destroy();
					return;
				}
				const roleValue = (parts[2] ?? "target").toLowerCase();
				if (roleValue !== "operator" && roleValue !== "target") {
					socket.destroy();
					return;
				}
				const target = config.store.get(keyValue);
				if (!target || target.status === "closed") {
					socket.destroy();
					return;
				}
				handshakeComplete = true;
				pairingKey = keyValue;
				role = roleValue as PairingRole;
				cleanup();
				const registerResult = config.store.registerSocket(
					keyValue,
					role,
					socket,
					remaining
				);
				if (!registerResult.ok) {
					socket.destroy();
				}
				return;
			}
		});

		socket.on("close", () => {
			cleanup();
		});

		socket.on("error", () => {
			cleanup();
		});
	});

	server.on("error", (error) => {
		console.error("Reverse shell TCP server error:", error);
	});

	server.listen(config.shellPort, config.shellHost, () => {
		console.log(
			`Reverse shell TCP listener active on ${config.shellHost}:${config.shellPort}`
		);
	});

	return server;
}
