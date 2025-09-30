import {
	queueStorage,
	currentStorage,
	historyStorage,
	type CTFItem,
} from "./storage.js";

export const ctfQueueManager = {
	queue: [] as CTFItem[],
	isProcessing: false,

	addToQueue: (ctf: CTFItem) => {
		ctfQueueManager.queue.push(ctf);
		ctfQueueManager.sortQueueByDate();
		queueStorage.write(ctfQueueManager.queue);
	},
	addToQueueSafe: async (ctf: CTFItem): Promise<void> => {
		while (ctfQueueManager.isProcessing) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		ctfQueueManager.isProcessing = true;
		try {
			ctfQueueManager.queue.push(ctf);
			ctfQueueManager.sortQueueByDate();
			queueStorage.write(ctfQueueManager.queue);
		} finally {
			ctfQueueManager.isProcessing = false;
		}
	},
	popFromQueue: () => {
		const ctf = ctfQueueManager.queue.shift();
		queueStorage.write(ctfQueueManager.queue);
		return ctf;
	},
	popFromQueueSafe: async (): Promise<CTFItem | undefined> => {
		while (ctfQueueManager.isProcessing) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		ctfQueueManager.isProcessing = true;
		try {
			const ctf = ctfQueueManager.queue.shift();
			queueStorage.write(ctfQueueManager.queue);
			return ctf;
		} finally {
			ctfQueueManager.isProcessing = false;
		}
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
		ctfQueueManager.sortQueueByDate();
	},
	saveQueue: () => {
		queueStorage.write(ctfQueueManager.queue);
	},
	cleanStartedCTFs: () => {
		const filteredQueue = ctfQueueManager.queue.filter(
			(ctf: CTFItem) => !ctf.started
		);
		if (filteredQueue.length !== ctfQueueManager.queue.length) {
			ctfQueueManager.queue = filteredQueue;
			ctfQueueManager.sortQueueByDate();
			queueStorage.write(ctfQueueManager.queue);
			return true;
		}
		return false;
	},

	sortQueueByDate: () => {
		ctfQueueManager.queue.sort((a: CTFItem, b: CTFItem) => {
			if (a.started && !b.started) return -1;
			if (!a.started && b.started) return 1;

			if (a.startAt && b.startAt) {
				return (
					new Date(a.startAt).getTime() -
					new Date(b.startAt).getTime()
				);
			}

			if (a.startAt && !b.startAt) return -1;
			if (!a.startAt && b.startAt) return 1;

			return (
				new Date(b.createdAt).getTime() -
				new Date(a.createdAt).getTime()
			);
		});
	},

	validateQueueConsistency: (): { isValid: boolean; issues: string[] } => {
		const issues: string[] = [];
		const current = ctfQueueManager.getCurrent();

		if (current && !current.started) {
			issues.push("Current CTF is not started");
		}

		const startedInQueue = ctfQueueManager.queue.filter(
			(ctf: CTFItem) => ctf.started
		);
		if (startedInQueue.length > 0) {
			issues.push(
				`${startedInQueue.length} started CTFs are still in the queue`
			);
		}

		if (ctfQueueManager.queue.length > 0) {
			const nextInQueue = ctfQueueManager.queue[0];
			if (nextInQueue?.startAt) {
				const now = new Date();
				const nextStartTime = new Date(nextInQueue.startAt);
				if (nextStartTime <= now) {
					issues.push(
						"The first item in the queue should have started"
					);
				}
			}
		}

		return {
			isValid: issues.length === 0,
			issues,
		};
	},

	getNextValidCTF: (): CTFItem | null => {
		const now = new Date();

		const validCTFs = ctfQueueManager.queue.filter((ctf: CTFItem) => {
			if (ctf.started) return false;

			if (!ctf.startAt) return false;

			const startTime = new Date(ctf.startAt);
			return (
				startTime <= now || startTime.getTime() - now.getTime() <= 60000
			);
		});

		return validCTFs.length > 0 ? validCTFs[0] || null : null;
	},

	resetQueue: () => {
		ctfQueueManager.queue = [];
		queueStorage.clear();
	},

	getCurrent: () => currentStorage.read(),
	setCurrent: (ctf: CTFItem | null) => currentStorage.write(ctf),
	clearCurrent: () => currentStorage.clear(),

	appendHistory: (ctf: CTFItem) => historyStorage.append(ctf),
	getHistory: () => historyStorage.read(),
	clearHistory: () => historyStorage.clear(),

	hasActiveCTF: (): boolean => {
		const current = ctfQueueManager.getCurrent();
		return current !== null && current.started !== false;
	},

	fixCurrentCTF: (): boolean => {
		ctfQueueManager.sortQueueByDate();

		const now = new Date();
		let earliestCTF: CTFItem | null = null;

		for (const ctf of ctfQueueManager.queue) {
			if (ctf.started) continue;

			if (!ctf.startAt) continue;

			const startTime = new Date(ctf.startAt);
			if (startTime <= now || earliestCTF === null) {
				if (
					earliestCTF === null ||
					startTime < new Date(earliestCTF.startAt!)
				) {
					earliestCTF = ctf;
				}
			}
		}

		if (earliestCTF) {
			const current = ctfQueueManager.getCurrent();

			if (current && current.started) {
				current.started = false;
				current.pending = true;
			}

			earliestCTF.started = true;
			earliestCTF.pending = false;
			ctfQueueManager.setCurrent(earliestCTF);

			ctfQueueManager.saveQueue();
			return true;
		}

		return false;
	},

	getNextPendingCTF: (): CTFItem | null => {
		const queue = ctfQueueManager.getQueue();
		return queue.find((ctf: CTFItem) => ctf.pending === true) || null;
	},

	startNextCTF: (guild: any): CTFItem | null => {
		const nextPending = ctfQueueManager.getNextPendingCTF();
		if (!nextPending) return null;

		const updatedQueue = ctfQueueManager
			.getQueue()
			.filter((ctf: CTFItem) => ctf !== nextPending);
		ctfQueueManager.queue = updatedQueue;
		queueStorage.write(updatedQueue);

		const startedCTF = { ...nextPending, started: true, pending: false };
		ctfQueueManager.setCurrent(startedCTF);

		return startedCTF;
	},
};
