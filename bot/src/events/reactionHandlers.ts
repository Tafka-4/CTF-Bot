import { Events, MessageReaction, User } from "discord.js";
import { serverDataStorage } from "../utils/storage.js";

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(
	reaction: MessageReaction,
	user: User,
	client: any
) {
	try {
		if (user.bot) return;
		if (reaction.partial) await reaction.fetch();
		const message = reaction.message;
		if (!message.guild || !message.channel.isThread()) return;
		const server = serverDataStorage.read();
		const rsvpMessageId = server.rsvpByThread?.[message.channel.id];
		if (!rsvpMessageId) return;
		if (reaction.emoji.name !== "✅" || message.id !== rsvpMessageId)
			return;
		serverDataStorage.update((cur) => {
			const participants = cur.participantsByThread ?? {};
			const list = new Set<string>(
				participants[message.channel.id] ?? []
			);
			list.add(user.id);
			participants[message.channel.id] = Array.from(list);
			return { ...cur, participantsByThread: participants };
		});
	} catch {}
}

export const name2 = Events.MessageReactionRemove;
export async function execute2(
	reaction: MessageReaction,
	user: User,
	client: any
) {
	try {
		if (user.bot) return;
		if (reaction.partial) await reaction.fetch();
		const message = reaction.message;
		if (!message.guild || !message.channel.isThread()) return;
		const server = serverDataStorage.read();
		const rsvpMessageId = server.rsvpByThread?.[message.channel.id];
		if (!rsvpMessageId) return;
		if (reaction.emoji.name !== "✅" || message.id !== rsvpMessageId)
			return;
		serverDataStorage.update((cur) => {
			const participants = cur.participantsByThread ?? {};
			const set = new Set<string>(participants[message.channel.id] ?? []);
			set.delete(user.id);
			participants[message.channel.id] = Array.from(set);
			return { ...cur, participantsByThread: participants };
		});
	} catch {}
}
