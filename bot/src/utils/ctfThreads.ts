import {
	CategoryChannel,
	ChannelType,
	Guild,
	TextChannel,
	ThreadAutoArchiveDuration,
	ThreadChannel,
} from "discord.js";
import { serverDataStorage } from "./storage.js";
import { buildCategoryButtonRows } from "./challengeFlow.js";

export const defaultThreadPosts = [
	{ name: "general", content: "General discussion" },
	{ name: "bot management", content: "Use the button to add challenges" },
	{ name: "notice", content: "Announcements" },
];

export async function findOrCreateCategory(
	guild: Guild,
	name: string
): Promise<CategoryChannel> {
	const existing = guild.channels.cache.find(
		(c) => c.type === ChannelType.GuildCategory && c.name === name
	) as CategoryChannel | undefined;
	if (existing) return existing;
	return (await guild.channels.create({
		name,
		type: ChannelType.GuildCategory,
	})) as CategoryChannel;
}

export async function createCTFThread(
	guild: Guild,
	ctfName: string
): Promise<ThreadChannel> {
	const server = serverDataStorage.read();
	const categoryId = server.ctfCategoryId;
	let parentCategory: CategoryChannel | null = null;
	if (categoryId) {
		parentCategory = (await guild.channels.fetch(
			categoryId
		)) as CategoryChannel | null;
	}
	if (!parentCategory) {
		parentCategory = await findOrCreateCategory(guild, "CTF");
		serverDataStorage.update((cur) => ({
			...cur,
			ctfCategoryId: parentCategory!.id,
		}));
	}

	// Create a temporary text channel as thread parent
	const hubChannel = (await guild.channels.create({
		name: `${ctfName}-hub`,
		type: ChannelType.GuildText,
		parent: parentCategory.id,
	})) as TextChannel;

	const thread = await hubChannel.threads.create({
		name: ctfName,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
	});

	// Seed default posts
	for (const post of defaultThreadPosts) {
		const msg = await thread.send(`[# ${post.name}]\n${post.content}`);
		if (post.name === "bot management") {
			await thread.send({
				content: "Select a category to add a challenge:",
				components: buildCategoryButtonRows(),
			});
		}
	}

	// RSVP message with ✅ reaction
	const rsvp = await thread.send(
		"React with ✅ to join this CTF. You'll be mentioned on challenge posts."
	);
	await rsvp.react("✅");

	serverDataStorage.update((cur) => {
		const rsvpByThread = cur.rsvpByThread ?? {};
		const participantsByThread = cur.participantsByThread ?? {};
		const ctfThreadsByName = cur.ctfThreadsByName ?? {};
		rsvpByThread[thread.id] = rsvp.id;
		participantsByThread[thread.id] = participantsByThread[thread.id] ?? [];
		ctfThreadsByName[ctfName] = thread.id;
		return { ...cur, rsvpByThread, participantsByThread, ctfThreadsByName };
	});

	return thread;
}

export async function retireThread(guild: Guild, threadId: string) {
	const server = serverDataStorage.read();
	const retiredId = server.retiredCategoryId;
	let retiredCategory: CategoryChannel | null = null;
	if (retiredId) {
		retiredCategory = (await guild.channels.fetch(
			retiredId
		)) as CategoryChannel | null;
	}
	if (!retiredCategory) {
		retiredCategory = await findOrCreateCategory(guild, "RETIRED");
		serverDataStorage.update((cur) => ({
			...cur,
			retiredCategoryId: retiredCategory!.id,
		}));
	}
	const thread = await guild.channels.fetch(threadId);
	if (thread && thread.isThread()) {
		const parent = thread.parent;
		if (parent && parent.isTextBased() && "setParent" in parent) {
			// Move the parent text channel into RETIRED category
			await (parent as any).setParent(retiredCategory.id);
		}
	}
}
