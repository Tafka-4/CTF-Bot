export type ServiceConfig = {
	httpPort: number;
	httpHost: string;
	shellPort: number;
	shellHost: string;
	maxBufferSize: number;
	tunnelHostname?: string;
	tunnelPublicPort: number;
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
	const tunnelHostname =
		env.REVSHELL_ACCESS_HOSTNAME?.trim() ||
		(env.DOMAIN ? `revshell.${env.DOMAIN.trim()}` : undefined);
	const tunnelPublicPort = parsePositiveInt(
		env.REVSHELL_PUBLIC_PORT,
		443,
		"REVSHELL_PUBLIC_PORT"
	);
	const downloadBase = normaliseUrlBase(
		env.REVSHELL_CLOUDFLARED_DOWNLOAD_BASE?.trim() ??
			"https://github.com/cloudflare/cloudflared/releases/latest/download"
	);
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
		...(tunnelHostname !== undefined ? { tunnelHostname } : {}),
		tunnelPublicPort,
		cloudflaredDownloadBase: downloadBase,
		clientProxyHost,
		clientProxyPort,
		pairingTtlMs,
		closedRetentionMs,
	};
}
