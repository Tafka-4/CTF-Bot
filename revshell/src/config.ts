export type ServiceConfig = {
	httpPort: number;
	httpHost: string;
	shellPort: number;
	shellHost: string;
	maxBufferSize: number;
	accessHostname: string;
	accessPort: number;
	accessUseTls: boolean;
	cloudflaredDownloadBase: string;
	clientProxyHost: string;
	clientProxyPort: number;
	pairingTtlMs: number;
	closedRetentionMs: number;
};

function parsePositiveInt(
	value: string | undefined,
	fallback: number,
	label: string
) {
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

function parseBoolean(value: string | undefined, label: string) {
	if (value === undefined) return undefined;
	const normalised = value.trim().toLowerCase();
	if (normalised === "") return undefined;
	if (["1", "true", "yes", "on"].includes(normalised)) return true;
	if (["0", "false", "no", "off"].includes(normalised)) return false;
	throw new Error(`${label} must be a boolean-like value (true/false)`);
}

export function loadConfig(env: NodeJS.ProcessEnv): ServiceConfig {
	const httpPort = parsePositiveInt(
		env.HTTP_PORT ?? env.PORT,
		8000,
		"HTTP_PORT"
	);
	const shellPort = parsePositiveInt(
		env.REVSHELL_LISTEN_PORT,
		3000,
		"REVSHELL_LISTEN_PORT"
	);
	const maxBufferSize = parsePositiveInt(
		env.REVSHELL_MAX_BUFFER_BYTES,
		256 * 1024,
		"REVSHELL_MAX_BUFFER_BYTES"
	);
	const accessHostnameCandidate =
		env.REVSHELL_ACCESS_HOSTNAME?.trim() ||
		(env.DOMAIN ? `revshell.${env.DOMAIN.trim()}` : "");
	if (!accessHostnameCandidate) {
		throw new Error(
			"REVSHELL_ACCESS_HOSTNAME or DOMAIN must be set so clients receive a reachable host."
		);
	}
	const accessHostname = accessHostnameCandidate;
	const accessPort = (() => {
		const explicit = env.REVSHELL_ACCESS_PORT?.trim();
		if (explicit) {
			return parsePositiveInt(
				explicit,
				shellPort,
				"REVSHELL_ACCESS_PORT"
			);
		}
		return shellPort;
	})();
	const downloadBase = normaliseUrlBase(
		env.REVSHELL_CLOUDFLARED_DOWNLOAD_BASE?.trim() ??
			"https://github.com/cloudflare/cloudflared/releases/latest/download"
	);
	const accessUseTls =
		parseBoolean(env.REVSHELL_ACCESS_TLS, "REVSHELL_ACCESS_TLS") ?? false;
	const clientProxyPort = parsePositiveInt(
		env.REVSHELL_CLIENT_PROXY_PORT,
		9210,
		"REVSHELL_CLIENT_PROXY_PORT"
	);
	const pairingTtlMs =
		parsePositiveInt(
			env.REVSHELL_PAIRING_TTL_MINUTES,
			30,
			"REVSHELL_PAIRING_TTL_MINUTES"
		) *
		60 *
		1000;
	const closedRetentionMs =
		parsePositiveInt(
			env.REVSHELL_PAIRING_CLOSED_RETENTION_MINUTES,
			10,
			"REVSHELL_PAIRING_CLOSED_RETENTION_MINUTES"
		) *
		60 *
		1000;

	const clientProxyHost =
		env.REVSHELL_CLIENT_PROXY_HOST?.trim() || "127.0.0.1";
	const httpHost = env.HTTP_HOST ?? "0.0.0.0";
	const shellHost = env.REVSHELL_LISTEN_HOST ?? "0.0.0.0";

	return {
		httpPort,
		httpHost,
		shellPort,
		shellHost,
		maxBufferSize,
		accessPort,
		accessUseTls,
		cloudflaredDownloadBase: downloadBase,
		clientProxyHost,
		clientProxyPort,
		pairingTtlMs,
		closedRetentionMs,
		accessHostname,
	};
}
