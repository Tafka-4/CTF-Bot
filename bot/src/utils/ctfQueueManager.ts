import {
	queueStorage,
	currentStorage,
	historyStorage,
	type CTFItem,
} from "./storage.js";

export const ctfQueueManager = {
	queue: [] as CTFItem[],

	addToQueue: (ctf: CTFItem) => {
		ctfQueueManager.queue.push(ctf);
		queueStorage.write(ctfQueueManager.queue);
	},
	popFromQueue: () => {
		const ctf = ctfQueueManager.queue.shift();
		queueStorage.write(ctfQueueManager.queue);
		return ctf;
	},
	getQueue: () => {
		return ctfQueueManager.queue;
	},
	getQueueLength: () => {
		return ctfQueueManager.queue.length;
	},
	clearQueue: () => {
		ctfQueueManager.queue = [];
		queueStorage.clear();
	},
	isEmpty: () => {
		return ctfQueueManager.queue.length === 0;
	},
	isNotEmpty: () => {
		return ctfQueueManager.queue.length > 0;
	},
	loadQueue: () => {
		ctfQueueManager.queue = queueStorage.read();
	},
	saveQueue: () => {
		queueStorage.write(ctfQueueManager.queue);
	},
	resetQueue: () => {
		ctfQueueManager.queue = [];
		queueStorage.clear();
	},

	// Current CTF helpers
	getCurrent: () => currentStorage.read(),
	setCurrent: (ctf: CTFItem | null) => currentStorage.write(ctf),
	clearCurrent: () => currentStorage.clear(),

	// History helpers
	appendHistory: (ctf: CTFItem) => historyStorage.append(ctf),
	getHistory: () => historyStorage.read(),
	clearHistory: () => historyStorage.clear(),
};
