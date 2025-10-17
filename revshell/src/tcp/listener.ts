import net from "node:net";

import type { PairingRole, PairingStore } from "../pairingStore.js";

export type TcpListenerConfig = {
	shellHost: string;
	shellPort: number;
	store: PairingStore;
	authTimeoutMs?: number;
	maxHandshakeBytes?: number;
};

let connectionSequence = 0;

function nextConnectionId() {
	connectionSequence += 1;
	return `tcp-${connectionSequence}`;
}

function describeSocket(socket: net.Socket) {
	return {
		remoteAddress: socket.remoteAddress,
		remotePort: socket.remotePort,
		localAddress: socket.localAddress,
		localPort: socket.localPort,
	};
}

function previewBuffer(chunk: Buffer, length = 80) {
	if (chunk.length === 0) return "";
	return chunk
		.toString("utf8", 0, length)
		.replace(/[\r\n\t]/g, " ")
		.trim();
}

export function createTcpListener(config: TcpListenerConfig) {
	const authTimeoutMs = config.authTimeoutMs ?? 10_000;
	const maxHandshakeBytes = config.maxHandshakeBytes ?? 2048;

	const server = net.createServer((socket) => {
		const connectionId = nextConnectionId();
		console.log(
			"[TCP]",
			connectionId,
			"connection accepted",
			describeSocket(socket)
		);
		socket.setKeepAlive(true, 30_000);
		socket.setNoDelay(true);
		let handshakeComplete = false;
		let pairingKey: string | null = null;
		let role: PairingRole | null = null;
		let buffer = Buffer.alloc(0);
		const authTimeout = setTimeout(() => {
			console.warn("[TCP]", connectionId, "handshake timeout");
			socket.destroy();
		}, authTimeoutMs);

		const cleanup = () => {
			clearTimeout(authTimeout);
		};

		socket.on("data", (chunk: Buffer) => {
			if (!handshakeComplete) {
				buffer = Buffer.concat([buffer, chunk]);
				console.log("[TCP]", connectionId, "handshake chunk", {
					bytes: chunk.length,
					totalBuffered: buffer.length,
					preview: previewBuffer(chunk),
				});
				if (buffer.length > maxHandshakeBytes) {
					console.warn("[TCP]", connectionId, "handshake overflow", {
						maxHandshakeBytes,
						bufferLength: buffer.length,
					});
					cleanup();
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
					console.warn("[TCP]", connectionId, "invalid handshake keyword", {
						line,
					});
					cleanup();
					socket.destroy();
					return;
				}
				const roleValue = (parts[2] ?? "target").toLowerCase();
				if (roleValue !== "operator" && roleValue !== "target") {
					console.warn("[TCP]", connectionId, "invalid handshake role", {
						role: roleValue,
					});
					cleanup();
					socket.destroy();
					return;
				}
				const target = config.store.get(keyValue);
				if (!target || target.status === "closed") {
					console.warn("[TCP]", connectionId, "pairing unavailable", {
						key: keyValue,
						status: target?.status ?? null,
					});
					cleanup();
					socket.destroy();
					return;
				}
				handshakeComplete = true;
				pairingKey = keyValue;
				role = roleValue as PairingRole;
				cleanup();
				console.log("[TCP]", connectionId, "handshake complete", {
					key: keyValue,
					role,
					initialBytes: remaining.length,
				});
				const registerResult = config.store.registerSocket(
					keyValue,
					role,
					socket,
					remaining
				);
				if (!registerResult.ok) {
					console.warn("[TCP]", connectionId, "register socket failed", {
						key: keyValue,
						role,
						error: registerResult.error,
					});
					socket.destroy();
				}
				return;
			}
			if (pairingKey && role) {
				console.log("[TCP]", connectionId, "data received", {
					key: pairingKey,
					role,
					bytes: chunk.length,
					preview: previewBuffer(chunk),
				});
			}
		});

		socket.on("close", () => {
			cleanup();
			console.log("[TCP]", connectionId, "socket closed", {
				key: pairingKey,
				role,
				handshakeComplete,
				bufferedBytes: buffer.length,
			});
		});

		socket.on("error", (error) => {
			cleanup();
			console.warn("[TCP]", connectionId, "socket error", {
				key: pairingKey,
				role,
				error,
			});
		});
	});

	server.on("error", (error) => {
		console.error("[TCP] server error", error);
	});

	server.listen(config.shellPort, config.shellHost, () => {
		console.log(
			`Reverse shell TCP listener active on ${config.shellHost}:${config.shellPort}`
		);
	});

	return server;
}
