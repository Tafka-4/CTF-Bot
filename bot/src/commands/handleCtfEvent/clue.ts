import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { serverDataStorage } from "../../utils/storage.js";
import { ensureForumThreadContext } from "../../utils/interactionGuards.js";

export const data = new SlashCommandBuilder()
	.setName("clue")
	.setDescription("Manage clues for this challenge thread")
	.addSubcommand((s) =>
		s.setName("add").setDescription("Open a modal to add a clue")
	)
	.addSubcommand((s) =>
		s.setName("show").setDescription("Show clues (index + title)")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const sub = interaction.options.getSubcommand();
	const thread = await ensureForumThreadContext(interaction);
	if (!thread) return;
	const threadId = interaction.channelId;
	if (sub === "add") {
		try {
			const {
				ModalBuilder,
				TextInputBuilder,
				TextInputStyle,
				ActionRowBuilder,
			} = await import("discord.js");
			const modal = new ModalBuilder()
				.setCustomId("add-clue-modal")
				.setTitle("Add Clue");

			const title = new TextInputBuilder()
				.setCustomId("title")
				.setLabel("Title")
				.setStyle(TextInputStyle.Short)
				.setRequired(true);
			const content = new TextInputBuilder()
				.setCustomId("content")
				.setLabel("Content")
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true);

			const titleRow = new (ActionRowBuilder as any)().addComponents(
				title
			);
			const contentRow = new (ActionRowBuilder as any)().addComponents(
				content
			);
			modal.addComponents(titleRow, contentRow);
			await (interaction as any).showModal(modal);
		} catch (e) {
			try {
				await interaction.reply({
					content: "Failed to open modal.",
					flags: 64,
				});
			} catch {}
		}
		return;
	}

	await interaction.deferReply({ ephemeral: true });

	if (sub === "show") {
		const cur = serverDataStorage.read();
		const list = (cur.clues?.[threadId] ?? []) as any[];
		const {
			EmbedBuilder,
			ActionRowBuilder,
			StringSelectMenuBuilder,
			ButtonBuilder,
			ButtonStyle,
		} = await import("discord.js");
		const pageSize = 25;
		const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
		const p = 0;
		const slice = list.slice(p * pageSize, p * pageSize + pageSize);
		const embed = new EmbedBuilder()
			.setTitle("Clues")
			.setColor(0x00a2ff)
			.setFooter({ text: `Page ${p + 1}/${totalPages}` })
			.setTimestamp(new Date());
		if (slice.length === 0) {
			embed.setDescription("No clues yet. Use the Add button below.");
		} else {
			for (let i = 0; i < slice.length; i++) {
				const idx = p * pageSize + i;
				embed.addFields({
					name: `${idx + 1}. ${slice[i]?.title || "(no title)"}`,
					value: "\u200b",
				});
			}
		}

		const navRow = new (ActionRowBuilder as any)().addComponents(
			new ButtonBuilder()
				.setCustomId(`clue-prev:${p}`)
				.setStyle(ButtonStyle.Secondary)
				.setLabel("Prev")
				.setDisabled(p === 0),
			new ButtonBuilder()
				.setCustomId(`clue-next:${p}`)
				.setStyle(ButtonStyle.Primary)
				.setLabel("Next")
				.setDisabled(totalPages <= 1)
		);
		const actionsRow = new (ActionRowBuilder as any)().addComponents(
			new ButtonBuilder()
				.setCustomId("clue-add")
				.setLabel("Add Clue")
				.setStyle(ButtonStyle.Primary)
		);
		const rows: any[] = [navRow, actionsRow];
		if (slice.length > 0) {
			const menu = new StringSelectMenuBuilder()
				.setCustomId("clue-select")
				.setPlaceholder("Select a clue to view")
				.setMaxValues(1);
			for (let i = 0; i < slice.length; i++) {
				const absoluteIndex = p * pageSize + i;
				menu.addOptions({
					label: `${absoluteIndex + 1}. ${
						slice[i]?.title || "(no title)"
					}`,
					value: String(absoluteIndex),
				});
			}
			rows.push(new (ActionRowBuilder as any)().addComponents(menu));
		}

		await interaction.editReply({ embeds: [embed], components: rows });
		return;
	}
}
