import { Events, MessageReaction, User, Guild } from "discord.js";
import { serverDataStorage } from "../utils/storage.js";

// Set view permissions for a user on all CTF forum threads
async function setParticipantPermissions(
	guild: Guild,
	threadId: string,
	userId: string,
	canView: boolean
) {
	try {
		const server = serverDataStorage.read();
		const ctfThreads = server.ctfThreadsByName ?? {};
		const ctfName = Object.keys(ctfThreads).find(
			(name) => ctfThreads[name] === threadId
		);

		if (!ctfName) return;

		// Get all threads for this CTF
		const managementThreadId = server.ctfManagementByName?.[ctfName];
		const noticeThreadId = server.ctfNoticeByName?.[ctfName];

		const threadIds = [threadId];
		if (managementThreadId) threadIds.push(managementThreadId);
		if (noticeThreadId) threadIds.push(noticeThreadId);

		for (const tid of threadIds) {
			try {
				const thread = await guild.channels.fetch(tid);
				if (thread && thread.isTextBased()) {
					await (thread as any).permissionOverwrites.edit(userId, {
						ViewChannel: canView,
						SendMessages: canView,
						ReadMessageHistory: canView,
					} as any);
				}
			} catch (error) {
				console.error(
					`Failed to set permissions for thread ${tid}:`,
					error
				);
			}
		}
	} catch (error) {
		console.error("Failed to set participant permissions:", error);
	}
}

async function processRSVPReaction(
	reaction: MessageReaction,
	user: User,
	isAdding: boolean
) {
	try {
		if (user.bot) return;
		if (reaction.partial) await reaction.fetch();
		const message = reaction.message;
		if (!message.guild) return;

		const server = serverDataStorage.read();
		const rsvpByThread = server.rsvpByThread ?? {};

		let threadId: string | null = null;
		for (const [tid, mid] of Object.entries(rsvpByThread)) {
			if (mid === message.id) {
				threadId = tid;
				break;
			}
		}

		if (
			!threadId ||
			reaction.emoji.name !== "✅" ||
			message.id !== rsvpByThread[threadId]
		)
			return;

		// Update participants list
		serverDataStorage.update((cur) => {
			const participants = cur.participantsByThread ?? {};
			const currentSet = new Set<string>(participants[threadId] ?? []);

			if (isAdding) {
				currentSet.add(user.id);
			} else {
				currentSet.delete(user.id);
			}

			participants[threadId] = Array.from(currentSet);
			return { ...cur, participantsByThread: participants };
		});

		// Set permissions for the user on forum threads
		await setParticipantPermissions(
			message.guild,
			threadId,
			user.id,
			isAdding
		);

		// Send appropriate message to the thread
		const ctfThreads = server.ctfThreadsByName ?? {};
		const ctfName = Object.keys(ctfThreads).find(
			(name) => ctfThreads[name] === threadId
		);

		if (ctfName) {
			try {
				const thread = await message.guild.channels.fetch(threadId);
				if (thread && thread.isTextBased()) {
					const welcomeMessage = isAdding
						? `🎉 <@${user.id}> joined **${ctfName}**! Welcome to the challenge discussions!`
						: `👋 <@${user.id}> left **${ctfName}**. Thanks for participating!`;

					await (thread as any).send(welcomeMessage);
				}
			} catch (error) {
				console.error(
					`Failed to send ${
						isAdding ? "welcome" : "goodbye"
					} message:`,
					error
				);
			}
		}
	} catch (error) {
		console.error(
			`Error processing RSVP ${isAdding ? "add" : "remove"} reaction:`,
			error
		);
	}
}

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(
	reaction: MessageReaction,
	user: User,
	client: any
) {
	await processRSVPReaction(reaction, user, true);
}

export const nameRemove = Events.MessageReactionRemove;

export async function executeRemove(
	reaction: MessageReaction,
	user: User,
	client: any
) {
	await processRSVPReaction(reaction, user, false);
}
