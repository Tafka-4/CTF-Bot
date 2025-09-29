import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("clue")
	.setDescription("Add or show clues for this challenge thread")
	.addSubcommand((s) =>
		s
			.setName("add")
			.setDescription("Add a clue for this thread")
			.addStringOption((o) =>
				o
					.setName("title")
					.setDescription("Short title for the clue")
					.setRequired(true)
			)
			.addStringOption((o) =>
				o
					.setName("content")
					.setDescription("Clue content")
					.setRequired(true)
			)
	)
	.addSubcommand((s) =>
		s.setName("show").setDescription("Show clues for this thread")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const sub = interaction.options.getSubcommand();
	const threadId = interaction.channelId;
	if (sub === "add") {
		const title = interaction.options.getString("title", true);
		const content = interaction.options.getString("content", true);
		serverDataStorage.update((cur) => {
			const clues = cur.clues ?? {};
			const list = (clues[threadId] ?? []) as any[];
			list.push({ title, content, createdAt: new Date().toISOString() });
			// Track contributor for this thread
			const contributors = cur.contributorsByThread ?? {};
			const clist = new Map(
				(contributors[threadId] ?? []).map((c) => [c.userId, c])
			);
			clist.set(interaction.user.id, {
				userId: interaction.user.id,
				userName: `${interaction.user.username}#${interaction.user.discriminator}`,
			});
			return {
				...cur,
				clues: { ...clues, [threadId]: list },
				contributorsByThread: {
					...contributors,
					[threadId]: Array.from(clist.values()),
				},
			};
		});
		await interaction.editReply("Clue added.");
		return;
	}

	if (sub === "show") {
		const cur = serverDataStorage.read();
		const list = (cur.clues?.[threadId] ?? []) as any[];
		if (list.length === 0) {
			await interaction.editReply("No clues for this thread.");
			return;
		}
		const text = list
			.map((c, i) => `${i + 1}. ${c.title}\n${c.content}`)
			.join("\n\n");
		await interaction.editReply("Posting clues to thread...");
		if (interaction.channel && interaction.channel.isTextBased()) {
			await (interaction.channel as any).send(text);
		}
	}
}
