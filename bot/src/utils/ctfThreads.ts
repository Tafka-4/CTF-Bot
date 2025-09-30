import { ChannelType, ThreadAutoArchiveDuration } from "discord.js";
import type {
	CategoryChannel,
	Guild,
	ThreadChannel,
	ForumChannel,
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

export async function setupForumTags(forum: ForumChannel): Promise<void> {
	const existingTags = forum.availableTags;
	const desiredEmojiByName: Record<string, string | null> = {
		Prob: "✏️",
		solve: "💡",
		general: "🧵",
	};

	for (const name of Object.keys(desiredEmojiByName)) {
		const found = existingTags.find((t) => t.name === name);
		if (!found) {
			try {
				await (forum as any).createTag({
					name,
					moderated: false,
					emoji: desiredEmojiByName[name],
				});
			} catch (e) {
				console.error(`Error creating forum tag ${name}:`, e);
			}
		}
	}

	for (const name of Object.keys(desiredEmojiByName)) {
		const found = (forum.availableTags || []).find(
			(t: any) => t.name === name
		);
		const desired = desiredEmojiByName[name];
		const currentEmoji =
			(found as any)?.emoji?.name || (found as any)?.emoji || null;
		if (found && currentEmoji !== desired) {
			try {
				// @ts-ignore - editTag is available on ForumChannel in discord.js v14
				await (forum as any).editTag((found as any).id, {
					emoji: desired,
				});
			} catch (e) {
				console.error(`Error editing forum tag ${name} emoji:`, e);
			}
		}
	}
}

export async function createCTFTopic(
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

	let forum: ForumChannel;
	const existingForumId = server.ctfForumId;
	if (existingForumId) {
		try {
			const existingForum = await guild.channels.fetch(existingForumId);
			if (
				existingForum &&
				existingForum.type === ChannelType.GuildForum
			) {
				await retireForum(guild, existingForum as ForumChannel);
			}
		} catch (error) {
			console.log(
				"No existing forum channel to retire, creating new one"
			);
		}
	}

	forum = await createNewForumChannel(guild, ctfName, parentCategory!.id);
	console.log(`Created new forum channel: ${forum.name}`);

	await setupForumTags(forum);

	const tags = forum.availableTags;
	const probTag = tags.find((tag) => tag.name === "Prob");
	const generalTag = tags.find((tag) => tag.name === "general");

	const generalThread = await forum.threads.create({
		name: `${ctfName} - general`,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		message: {
			content: `General discussion and offtopic chat`,
		},
		appliedTags: generalTag ? [generalTag.id] : [],
	});

	const noticeThread = await forum.threads.create({
		name: `${ctfName} - notice`,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		message: {
			content: `Announcements and important updates`,
		},
		appliedTags: generalTag ? [generalTag.id] : [],
	});

	const management = await forum.threads.create({
		name: `${ctfName} - management`,
		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
		message: {
			content: `Use the buttons below to add challenges`,
		},
		appliedTags: generalTag ? [generalTag.id] : [],
	});
	await management.send({
		content: "Select a category to add a challenge:",
		components: buildCategoryButtonRows(),
	});

	serverDataStorage.update((cur) => {
		const ctfThreadsByName = cur.ctfThreadsByName ?? {};
		const ctfManagementByName = cur.ctfManagementByName ?? {};
		const ctfNoticeByName = cur.ctfNoticeByName ?? {};

		ctfThreadsByName[ctfName] = generalThread.id;
		ctfManagementByName[ctfName] = management.id;
		ctfNoticeByName[ctfName] = noticeThread.id;

		return {
			...cur,
			ctfForumId: forum.id,
			ctfThreadsByName,
			ctfManagementByName,
			ctfNoticeByName,
		};
	});

	return management;
}

async function deleteForumChannelCompletely(
	forum: ForumChannel
): Promise<void> {
	try {
		const threads = forum.threads.cache;
		for (const thread of threads.values()) {
			try {
				await thread.delete("Cleaning up old CTF forum");
			} catch (error) {
				console.error(`Error deleting thread ${thread.name}:`, error);
			}
		}
		await forum.delete("Creating new CTF forum");
	} catch (error) {
		console.error("Error deleting forum channel completely:", error);
	}
}

async function createNewForumChannel(
	guild: Guild,
	ctfName: string,
	parentId: string
): Promise<ForumChannel> {
	const forum = (await guild.channels.create({
		name: ctfName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
		type: ChannelType.GuildForum,
		parent: parentId,
	})) as ForumChannel;

	return forum;
}

export async function retireForum(
	guild: Guild,
	forum: ForumChannel
): Promise<void> {
	const retiredCategory = await findOrCreateCategory(guild, "RETIRED");

	// 포럼 이동
	try {
		await forum.setParent(retiredCategory.id);
	} catch (e) {
		console.error("Error moving forum to RETIRED:", e);
	}

	// 스레드 아카이브/락 시도 (최대한)
	try {
		const threads = forum.threads.cache;
		for (const thread of threads.values()) {
			try {
				await thread.setArchived(true);
				await thread.setLocked(true);
			} catch {}
		}
	} catch (e) {
		console.error("Error archiving threads in retired forum:", e);
	}

	// 메타데이터 보관
	serverDataStorage.update((cur) => {
		const list = cur.retiredForums ?? [];
		return {
			...cur,
			retiredForums: [
				{
					forumId: forum.id,
					name: forum.name,
					retiredAt: new Date().toISOString(),
				},
				...list.filter((x) => x.forumId !== forum.id),
			],
		};
	});

	console.log(`Moved forum to RETIRED: ${forum.name}`);
}

export async function getCurrentForumChannel(
	guild: Guild
): Promise<ForumChannel | null> {
	try {
		const server = serverDataStorage.read();
		const forumId = server.ctfForumId;

		if (!forumId) return null;

		const forum = await guild.channels.fetch(forumId);
		if (forum && forum.type === ChannelType.GuildForum) {
			return forum as ForumChannel;
		}

		return null;
	} catch (error) {
		console.error("Error getting current forum channel:", error);
		return null;
	}
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
		try {
			await (thread as ThreadChannel).setArchived(true);
			await (thread as ThreadChannel).setLocked(true);
		} catch {}
		const parent = (thread as ThreadChannel).parent;
		if (parent && parent.type === ChannelType.GuildForum) {
			return;
		}
		if (parent && "setParent" in (parent as any)) {
			try {
				await (parent as any).setParent(retiredCategory.id);
			} catch {}
		}
	}
}
