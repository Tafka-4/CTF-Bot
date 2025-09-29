import fs from "fs";
import path from "path";

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
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeJson<T = JsonValue>(filePath: string, data: T) {
	ensureFile(filePath, data);
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const storageDir = path.join(__dirname, "../../storage");

export const storagePaths = {
	queue: path.join(storageDir, "ctfQueue.json"),
	current: path.join(storageDir, "currentCTF.json"),
	history: path.join(storageDir, "ctfHistory.json"),
	serverData: path.join(storageDir, "serverData.json"),
};

export const queueStorage = {
	read: () => readJson<any[]>(storagePaths.queue, []),
	write: (queue: any[]) => writeJson(storagePaths.queue, queue),
	clear: () => writeJson(storagePaths.queue, []),
};

export const currentStorage = {
	read: () => readJson<any | null>(storagePaths.current, null),
	write: (ctf: any | null) => writeJson(storagePaths.current, ctf),
	clear: () => writeJson(storagePaths.current, null),
};

export const historyStorage = {
	read: () => readJson<any[]>(storagePaths.history, []),
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

export type ServerData = {
	serverId?: string;
	ctfCategoryId?: string;
	retiredCategoryId?: string;
	hubChannelId?: string;
	adminAlertChannelId?: string;
	firstbloodInfo?: Record<string, FirstbloodEntry>;
	solves?: SolveRecord[];
	problems?: Record<string, ProblemEntry[]>;
	clues?: Record<string, ClueEntry[]>;
	ctfThreadsByName?: Record<string, string>; // name -> threadId
	rsvpByThread?: Record<string, string>; // threadId -> messageId
	participantsByThread?: Record<string, string[]>; // threadId -> userId[]
	contributorsByThread?: Record<
		string,
		{ userId: string; userName: string }[]
	>;
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
};
