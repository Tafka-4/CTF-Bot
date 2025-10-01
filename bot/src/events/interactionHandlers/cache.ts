const searchResultsCache = new Map<
	string,
	{ total: number; items: any[]; timestamp: number }
>();
const CACHE_EXPIRY = 5 * 60 * 1000;

export function getCacheKey(
	q: string,
	timeframe: string,
	page: number
): string {
	return `${q}:${timeframe}:${page}`;
}

export function getCachedResults(q: string, timeframe: string, page: number) {
	const globalAny = globalThis as any;
	const globalCache = globalAny?.ctftimeSearchCache;
	if (globalCache) {
		const key = getCacheKey(q, timeframe, page);
		const cached = globalCache.get(key);
		if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
			return cached;
		}
		if (cached) {
			globalCache.delete(key);
		}
	}

	const key = getCacheKey(q, timeframe, page);
	const cached = searchResultsCache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
		return cached;
	}
	if (cached) {
		searchResultsCache.delete(key);
	}
	return null;
}

export function setCachedResults(
	q: string,
	timeframe: string,
	page: number,
	total: number,
	items: any[]
) {
	const key = getCacheKey(q, timeframe, page);
	const payload = {
		total,
		items,
		timestamp: Date.now(),
	};
	searchResultsCache.set(key, payload);
	const globalAny = globalThis as any;
	if (globalAny) {
		if (!globalAny.ctftimeSearchCache) {
			globalAny.ctftimeSearchCache = new Map();
		}
		try {
			globalAny.ctftimeSearchCache.set(key, payload);
		} catch {}
	}
}
