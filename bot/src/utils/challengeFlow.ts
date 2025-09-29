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
			...challenge,
			category: cat,
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
	const cat = ensureValidCategory(challenge.category);
	const header = `[${cat}]`;
	const participants = (serverDataStorage.read().participantsByThread?.[
		threadId
	] ?? []) as string[];
	const mentions =
		participants.length > 0
			? `\n${participants.map((id) => `<@${id}>`).join(" ")}`
			: "";
	const content = `${header} ${challenge.title}\n${challenge.desc}${mentions}`;
	const sent = await channel.send(content);
	serverDataStorage.update((cur) => {
		const problems = cur.problems ?? {};
		const list = (problems[threadId] as ProblemEntry[]) ?? [];
		list.unshift({
			problemId: `${Date.now()}-${Math.random()
				.toString(36)
				.slice(2, 8)}`,
			...challenge,
			category: cat,
			header,
			message: content,
			messageId: sent.id,
			createdAt: new Date().toISOString(),
		});
		return { ...cur, problems: { ...problems, [threadId]: list } };
	});
}
