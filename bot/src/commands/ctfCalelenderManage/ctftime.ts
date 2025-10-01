import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import {
	searchCtftimeEvents,
	type CtftimeTimeframe,
} from "../../utils/ctftime.js";
import { setCachedResults } from "../../events/interactionHandlers/cache.js";

export const data = new SlashCommandBuilder()
	.setName("ctftime")
	.setDescription("Search CTFtime events and paginate results")
	.addStringOption((o) =>
		o.setName("q").setDescription("query").setRequired(false)
	)
	.addStringOption((o) =>
		o
			.setName("timeframe")
			.setDescription("Filter timeframe")
			.addChoices(
				{ name: "upcoming", value: "upcoming" },
				{ name: "running", value: "running" },
				{ name: "archive", value: "archive" }
			)
			.setRequired(false)
	);

const PAGE_SIZE = 5;

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const q = interaction.options.getString("q", false) || "";
	const timeframe = (interaction.options.getString("timeframe", false) ||
		"upcoming") as CtftimeTimeframe;
	const page = 0;

	const { total, items } = await searchCtftimeEvents(
		q,
		timeframe,
		page,
		PAGE_SIZE
	);

	setCachedResults(q, timeframe, page, total, items);

	const embed = new EmbedBuilder()
		.setTitle(`CTFtime search: ${q}`)
		.setFooter({
			text: `Page ${page + 1}/${Math.max(
				1,
				Math.ceil(total / PAGE_SIZE)
			)}`,
		})
		.setColor(0x00a2ff)
		.setTimestamp(new Date());

	if (items.length === 0) {
		embed.setDescription("❌ No CTF events found matching your search.");
	} else {
		let resultsText = `🔍 **Found ${items.length} CTF event${
			items.length > 1 ? "s" : ""
		}:**\n\n`;

		for (let i = 0; i < items.length; i++) {
			const e = items[i]!;
			const start = e.start
				? new Date(e.start).toLocaleDateString()
				: "TBD";
			const finish = e.finish
				? new Date(e.finish).toLocaleDateString()
				: "TBD";

			resultsText += `**${i + 1}.** ${e.title} (ID: ${e.id})\n`;
			resultsText += `📅 ${start} - ${finish}\n`;
			resultsText += `🔗 ${e.ctf_url || e.url || "No URL"}\n`;
			resultsText += `\n`;
		}

		resultsText += `💡 **Tip:** Use the "Select CTF" button below, then enter the number or name to add this CTF to your server.`;

		embed.setDescription(resultsText);
	}

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(
				`ctfs-prev:${encodeURIComponent(q)}:${timeframe}:${page}`
			)
			.setStyle(ButtonStyle.Secondary)
			.setLabel("Prev")
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(
				`ctfs-next:${encodeURIComponent(q)}:${timeframe}:${page}`
			)
			.setStyle(ButtonStyle.Primary)
			.setLabel("Next")
			.setDisabled(total <= PAGE_SIZE)
	);

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(
			`ctfs-select:${encodeURIComponent(q)}:${timeframe}:${page}`
		)
		.setPlaceholder("🎯 Select a CTF to add to your server")
		.setMaxValues(1);

	for (let i = 0; i < items.length; i++) {
		const e = items[i]!;
		const start = e.start ? new Date(e.start).toLocaleDateString() : "TBD";
		const finish = e.finish
			? new Date(e.finish).toLocaleDateString()
			: "TBD";

		selectMenu.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel(`${i + 1}. ${e.title}`)
				.setDescription(`📅 ${start} - ${finish} | ID: ${e.id}`)
				.setValue(e.id.toString())
				.setEmoji("🎯")
		);
	}

	const selectRow =
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			selectMenu
		);

	await interaction.editReply({
		embeds: [embed],
		components: [row, selectRow],
	});
}
