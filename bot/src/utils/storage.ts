import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type JsonValue = any;

function ensureFile(filePath: string, defaultContent: JsonValue) {
	if (!fs.existsSync(filePath)) {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
	}
}

function readJson<T = JsonValue>(filePath: string, fallback: T): T {
	try {
		ensureFile(filePath, fallback);
		const raw = fs.readFileSync(filePath, "utf8");
		if (!raw || raw.trim() === "") {
			return fallback;
		}
		const parsed = JSON.parse(raw);
		if (Array.isArray(fallback) && !Array.isArray(parsed)) {
			console.warn(
				`Expected array but got ${typeof parsed} for ${filePath}, using fallback`
			);
			return fallback;
		}
		return parsed as T;
	} catch (error) {
		console.warn(`Failed to parse ${filePath}: ${error}, using fallback`);
		return fallback;
	}
}

function writeJson<T = JsonValue>(filePath: string, data: T) {
	ensureFile(filePath, data);
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = path.join(__dirname, "../../storage");

export const storagePaths = {
	queue: path.join(storageDir, "ctfQueue.json"),
	current: path.join(storageDir, "currentCTF.json"),
	history: path.join(storageDir, "ctfHistory.json"),
	serverData: path.join(storageDir, "serverData.json"),
};

export const queueStorage = {
	read: (): any[] => {
		return readJson<any[]>(storagePaths.queue, []);
	},
	write: (queue: any[]) => writeJson(storagePaths.queue, queue),
	clear: () => writeJson(storagePaths.queue, []),
};

export const currentStorage = {
	read: (): any | null => {
		const c = readJson<any | null>(storagePaths.current, null);
		return c;
	},
	write: (ctf: any | null) => writeJson(storagePaths.current, ctf),
	clear: () => writeJson(storagePaths.current, null),
};

export const historyStorage = {
	read: (): any[] => {
		return readJson<any[]>(storagePaths.history, []);
	},
	write: (history: any[]) => writeJson(storagePaths.history, history),
	append: (ctf: any) => {
		const h = readJson<any[]>(storagePaths.history, []);
		h.unshift(ctf);
		writeJson(storagePaths.history, h);
	},
	clear: () => writeJson(storagePaths.history, []),
};

export type CTFItem = {
	name: string;
	url: string;
	description: string;
	createdAt: string;
	startAt?: string; // ISO string
	started?: boolean;
	guildId?: string;
	pending?: boolean; // 대기 상태 플래그
};

export type SolveRecord = {
	threadId: string;
	messageId?: string;
	solverId: string;
	solverName: string;
	flag: string;
	timestamp: string;
	isFirstBlood?: boolean;
	problemId?: string;
	contributors?: { userId: string; userName: string }[];
};

export type ProblemEntry = {
	problemId?: string;
	title: string;
	category: string;
	desc: string;
	authorId: string;
	header: string;
	message: string;
	messageId?: string;
	createdAt: string;
};

export type ClueEntry = {
	problemId?: string;
	title: string;
	content: string;
	createdAt: string;
};

export type FirstbloodEntry = {
	solverId: string;
	solverName: string;
	timestamp: string;
};

export type RequestBinRecord = {
	ownerUserId: string;
	guildId?: string;
	lastThreadId?: string;
	lastChannelId?: string;
	binId: string;
	label?: string;
	createdAt: string;
	expiresAt: string;
	endpointUrl: string;
	inspectUrl: string;
	token: string;
};

export type RevshellUserRecord = {
	ownerUserId: string;
	guildId?: string | null;
	lastChannelId?: string | null;
	lastThreadId?: string | null;
	lastSessionId?: string | null;
	lastPairingKey?: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ServerData = {
	serverId?: string;
	ctfCategoryId?: string;
	retiredCategoryId?: string;
	hubChannelId?: string;
	ctfForumId?: string;
	retiredForums?: {
		forumId: string;
		name: string;
		retiredAt: string;
	}[];
	noticeChannelId?: string;
	firstbloodInfo?: Record<string, FirstbloodEntry>;
	firstbloodByForum?: Record<
		string,
		FirstbloodEntry & {
			threadId: string;
			problemId?: string;
			createdAt: string;
		}
	>;
	solves?: SolveRecord[];
	problems?: Record<string, ProblemEntry[]>;
	clues?: Record<string, ClueEntry[]>;
	ctfThreadsByName?: Record<string, string>;
	ctfManagementByName?: Record<string, string>;
	ctfNoticeByName?: Record<string, string>;
	ctfAnnouncements?: Record<
		string,
		{
			channelId: string;
			messageId: string;
			guildId: string;
		}
	>;
	rsvpByThread?: Record<string, string>;
	participantsByThread?: Record<string, string[]>;
	contributorsByThread?: Record<
		string,
		{ userId: string; userName: string }[]
	>;
	roleSelectionMessage?: {
		channelId: string;
		messageId: string;
		guildId: string;
	};
	requestBinsByUser?: Record<string, RequestBinRecord>;
	revshellByUser?: Record<string, RevshellUserRecord>;
	/** @deprecated retained for backward compatibility */
	requestBinsByThread?: Record<string, RequestBinRecord>;
};

export const serverDataStorage = {
	read: () => readJson<ServerData>(storagePaths.serverData, {}),
	write: (data: ServerData) => writeJson(storagePaths.serverData, data),
	update: (updater: (cur: ServerData) => ServerData) => {
		const cur = readJson<ServerData>(storagePaths.serverData, {});
		const next = updater(cur);
		writeJson(storagePaths.serverData, next);
		return next;
	},

	getNoticeChannelId: (): string | undefined => {
		return readJson<ServerData>(storagePaths.serverData, {})
			.noticeChannelId;
	},

	setNoticeChannelId: (channelId: string): void => {
		const data = readJson<ServerData>(storagePaths.serverData, {});
		writeJson(storagePaths.serverData, {
			...data,
			noticeChannelId: channelId,
		});
	},

	clearNoticeChannel: (): void => {
		const data = readJson<ServerData>(storagePaths.serverData, {});
		writeJson(storagePaths.serverData, {
			...data,
			noticeChannelId: undefined,
		});
	},

	sendNoticeMessage: async (
		client: any,
		message: string,
		options?: { embeds?: any[]; components?: any[] }
	): Promise<{ success: boolean; messageId?: string }> => {
		try {
			const noticeChannelId = readJson<ServerData>(
				storagePaths.serverData,
				{}
			).noticeChannelId;
			if (!noticeChannelId) {
				console.log("Notice channel not set");
				return { success: false };
			}

			const channel = await client.channels.fetch(noticeChannelId);
			if (!channel || !channel.isTextBased()) {
				console.log("Notice channel not found or not text-based");
				return { success: false };
			}

			const payload: any = { content: message };
			if (options?.embeds) payload.embeds = options.embeds;
			if (options?.components) payload.components = options.components;

			const sentMessage = await channel.send(payload);
			return { success: true, messageId: sentMessage.id };
		} catch (error) {
			console.error("Failed to send notice message:", error);
			return { success: false };
		}
	},
};
