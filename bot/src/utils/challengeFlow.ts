import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import type { TextChannel, ThreadChannel } from "discord.js";
import { serverDataStorage, type ProblemEntry } from "./storage.js";

export const CATEGORIES = [
	"Web",
	"Pwn",
	"Rev",
	"Crypto",
	"Misc",
	"Forensic",
	"OSINT",
	"AI",
];

export function ensureValidCategory(input: string): string {
	const match = CATEGORIES.find(
		(c) => c.toLowerCase() === input.toLowerCase()
	);
	return match ?? "Misc";
}

export function buildCategoryButtonRows() {
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	let current = new ActionRowBuilder<ButtonBuilder>();
	for (let i = 0; i < CATEGORIES.length; i++) {
		const cat: string = CATEGORIES[i] as string;
		const btn = new ButtonBuilder()
			.setCustomId(`add-challenge:${cat}`)
			.setLabel(cat)
			.setStyle(ButtonStyle.Primary);
		current.addComponents(btn);
		if ((i + 1) % 5 === 0 || i === CATEGORIES.length - 1) {
			rows.push(current);
			current = new ActionRowBuilder<ButtonBuilder>();
		}
	}
	return rows;
}

export async function showAddChallengeModal(
	i: ButtonInteraction,
	category: string
) {
	const modal = new ModalBuilder()
		.setCustomId(`add-challenge-modal:${category}`)
		.setTitle(`Add Challenge - ${category}`);
	const title = new TextInputBuilder()
		.setCustomId("title")
		.setLabel("Title")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);
	const desc = new TextInputBuilder()
		.setCustomId("desc")
		.setLabel("Description")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);
	modal.addComponents(
		new ActionRowBuilder<TextInputBuilder>().addComponents(title),
		new ActionRowBuilder<TextInputBuilder>().addComponents(desc)
	);
	await i.showModal(modal);
}

export function getChallengeStatusTag(
	threadId: string,
	problemId?: string
): string {
	const serverData = serverDataStorage.read();
	const solves = serverData.solves ?? [];

	if (problemId) {
		const isSolved = solves.some((solve) => solve.problemId === problemId);
		return isSolved ? "solve" : "Prob";
	}

	const threadSolves = solves.filter((solve) => solve.threadId === threadId);
	return threadSolves.length > 0 ? "solve" : "Prob";
}

export async function updateChallengeMessageStatus(
	threadId: string,
	problemId: string,
	guild: any
): Promise<void> {
	try {
		const serverData = serverDataStorage.read();
		const problems = serverData.problems?.[threadId] ?? [];
		const problem = problems.find(
			(p: ProblemEntry) => p.problemId === problemId
		);

		if (!problem) return;

		const thread = await guild.channels.fetch(threadId).catch(() => null);
		if (!thread || !thread.isTextBased()) return;

		let message: any = null;
		try {
			if (typeof (thread as any).fetchStarterMessage === "function") {
				message = await (thread as any).fetchStarterMessage();
			}
		} catch {}
		if (!message && problem.messageId) {
			message = await (thread as any).messages
				.fetch(problem.messageId)
				.catch(() => null);
		}

		const cat = ensureValidCategory(problem.category);
		const newHeader = `[${cat}]`;

		const oldHeaderPattern = /^\[[^\]]+\]/;
		let newContent: string | undefined;
		if (message && message.content) {
			newContent = String(message.content).replace(
				oldHeaderPattern,
				newHeader
			);
		}

		if (
			(thread as any).parent &&
			"availableTags" in (thread as any).parent
		) {
			const forumChannel = (thread as any).parent;
			const solveTag = forumChannel.availableTags.find(
				(tag: any) => tag.name === "solve"
			);
			if (solveTag) {
				try {
					if (typeof (thread as any).setAppliedTags === "function") {
						await (thread as any).setAppliedTags([solveTag.id]);
					} else if (typeof (thread as any).edit === "function") {
						await (thread as any).edit({
							appliedTags: [solveTag.id],
						});
					}
				} catch (e) {
					console.error(
						"Failed to update thread appliedTags to solve:",
						e
					);
				}
			}
		}

		if (message && newContent && typeof message.edit === "function") {
			await message.edit({ content: newContent });
		}

		serverDataStorage.update((cur) => {
			const problems = cur.problems ?? {};
			const list = (problems[threadId] as ProblemEntry[]) ?? [];
			const problemIndex = list.findIndex(
				(p) => p.problemId === problemId
			);

			if (problemIndex !== -1) {
				list[problemIndex] = {
					...list[problemIndex],
					header: newHeader,
					...(newContent ? { message: newContent } : {}),
				} as ProblemEntry;
			}

			return { ...cur, problems: { ...problems, [threadId]: list } };
		});
	} catch (error) {
		console.error("Error updating challenge message status:", error);
	}
}

export function saveChallenge(
	threadId: string,
	challenge: {
		title: string;
		category: string;
		desc: string;
		authorId: string;
	}
) {
	serverDataStorage.update((cur) => {
		const problems = cur.problems ?? {};
		const list = (problems[threadId] as ProblemEntry[]) ?? [];
		const cat = ensureValidCategory(challenge.category);
		const header = `[${cat}]`;
		list.unshift({
			problemId: `${Date.now()}-${Math.random()
				.toString(36)
				.slice(2, 8)}`,
			title: challenge.title,
			category: cat,
			desc: challenge.desc,
			authorId: challenge.authorId,
			header,
			message: `${header} ${challenge.title}\n${challenge.desc}`,
			createdAt: new Date().toISOString(),
		});
		return { ...cur, problems: { ...problems, [threadId]: list } };
	});
}

export async function createAndSaveChallengePost(
	channel: TextChannel | ThreadChannel,
	threadId: string,
	challenge: {
		title: string;
		category: string;
		desc: string;
		authorId: string;
	}
) {
	console.log("createAndSaveChallengePost called:", {
		channelId: channel.id,
		channelName: channel.name,
		channelType: channel.type,
		threadId,
		challengeTitle: challenge.title,
		challengeCategory: challenge.category,
	});

	try {
		if (!channel.parent || !("availableTags" in channel.parent)) {
			console.log("Channel is not a forum thread, saving challenge only");
			saveChallenge(threadId, {
				title: challenge.title,
				category: challenge.category,
				desc: challenge.desc,
				authorId: challenge.authorId,
			});
			return;
		}

		const forumChannel = channel.parent;
		const cat = ensureValidCategory(challenge.category);
		const header = `[${cat}]`;
		const participants = (serverDataStorage.read().participantsByThread?.[
			threadId
		] ?? []) as string[];

		const resolveCategoryRoleMention = (): string => {
			try {
				const guild = (channel as any).guild;
				if (!guild) return "";
				const candidates = [
					cat,
					cat.toUpperCase(),
					cat.toLowerCase(),
					cat === "Rev" ? "Reverse" : cat,
					cat === "OSINT" ? "Osint" : cat,
					cat === "AI" ? "Ai" : cat,
				];
				const role = guild.roles.cache.find((r: any) =>
					candidates.includes(String(r.name))
				);
				return role ? `<@&${role.id}>` : "";
			} catch {
				return "";
			}
		};

		const roleMentions = resolveCategoryRoleMention();
		const authorMention = `<@${challenge.authorId}>`;

		const content = `${challenge.desc}\n\nNew ${cat} challenge added by ${authorMention}! ${roleMentions}`;

		console.log("Message content prepared:", {
			header,
			content: content.substring(0, 100) + "...",
		});

		console.log("Parent forum channel found:", forumChannel.name);
		const probTag = forumChannel.availableTags.find(
			(tag: any) => tag.name === "Prob"
		);

		let appliedTags: string[] = [];
		if (probTag) {
			appliedTags = [probTag.id];
			console.log("Found Prob tag:", probTag.name);
		} else {
			console.log(
				"Prob tag not found in available tags:",
				forumChannel.availableTags.map((t: any) => t.name)
			);
		}

		console.log("Creating new thread in forum...");
		const thread = await forumChannel.threads.create({
			name: `${header} ${challenge.title}`,
			autoArchiveDuration: 1440,
			message: {
				content,
			},
			appliedTags,
		});

		console.log("Challenge thread created successfully:", thread.id);

		let starterMessageId: string | undefined = undefined;
		try {
			if (typeof (thread as any).fetchStarterMessage === "function") {
				const starter = await (thread as any).fetchStarterMessage();
				starterMessageId = starter?.id;
			}
		} catch {}

		const newThreadId = (thread as any).id as string;
		serverDataStorage.update((cur) => {
			const problems = cur.problems ?? {};
			const list = (problems[newThreadId] as ProblemEntry[]) ?? [];
			list.unshift({
				problemId: `${Date.now()}-${Math.random()
					.toString(36)
					.slice(2, 8)}`,
				title: challenge.title,
				category: cat,
				desc: challenge.desc,
				authorId: challenge.authorId,
				header: header || "",
				message: content,
				...(starterMessageId ? { messageId: starterMessageId } : {}),
				createdAt: new Date().toISOString(),
			});
			const firstItem = list[0];
			console.log("Challenge saved to storage:", {
				problemId: firstItem?.problemId,
				threadId: newThreadId,
			});
			return { ...cur, problems: { ...problems, [newThreadId]: list } };
		});
	} catch (error) {
		console.error("Error in createAndSaveChallengePost:", error);
		throw error instanceof Error ? error : new Error(String(error));
	}
}
