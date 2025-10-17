import type {
	RevshellCommandMode,
	RevshellCommandVariants,
	RevshellConnectionInfo,
	RevshellPairingSummary,
} from "./types.js";

type CacheEntry = {
	ownerUserId: string;
	connection: RevshellConnectionInfo;
	pairing: RevshellPairingSummary;
	variants: RevshellCommandVariants;
	defaultMode: RevshellCommandMode;
	lastMode: RevshellCommandMode;
	createdAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

function isExpired(entry: CacheEntry) {
	return Date.now() - entry.createdAt > TTL_MS;
}

export function setRevshellCommandCache(
	key: string,
	value: Omit<CacheEntry, "createdAt" | "lastMode"> & {
		initialMode?: RevshellCommandMode;
	}
) {
	const mode = value.initialMode ?? value.defaultMode;
	cache.set(key, {
		...value,
		lastMode: mode,
		createdAt: Date.now(),
	});
}

export function getRevshellCommandCache(key: string) {
	const entry = cache.get(key);
	if (!entry) return null;
	if (isExpired(entry)) {
		cache.delete(key);
		return null;
	}
	return entry;
}

export function updateRevshellCommandMode(
	key: string,
	mode: RevshellCommandMode
) {
	const entry = cache.get(key);
	if (!entry) return;
	cache.set(key, { ...entry, lastMode: mode });
}

export function deleteRevshellCommandCache(key: string) {
	cache.delete(key);
}

export function getLastModeOrDefault(
	key: string
): RevshellCommandMode | null {
	const entry = getRevshellCommandCache(key);
	if (!entry) return null;
	return entry.lastMode ?? entry.defaultMode;
}
