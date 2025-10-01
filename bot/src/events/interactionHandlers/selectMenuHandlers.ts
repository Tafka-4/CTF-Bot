import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import { getCachedResults } from "./cache.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";

export async function handleCTFSelection(interaction: any) {
	let selectedCTF: any = null;

	try {
		const selectedValue = (interaction as any).values?.[0];

		if (!selectedValue) {
			await interaction.reply({
				content: "❌ No CTF selected. Please try again.",
				flags: 64,
			});
			return;
		}

		const [, q, timeframe, pageStr] = interaction.customId.split(":");
		const page = parseInt(pageStr || "0");
		const decodedQ = decodeURIComponent(q || "");
		const decodedTimeframe = decodeURIComponent(timeframe || "upcoming");

		const cachedResult = getCachedResults(decodedQ, decodedTimeframe, page);

		if (cachedResult) {
			selectedCTF = cachedResult.items.find(
				(ctf: any) => ctf.id.toString() === selectedValue
			);
		}

		if (!selectedCTF) {
			await interaction.reply({
				content:
					"❌ This search result expired. Please run `/ctftime` again and pick the CTF once more.",
				flags: 64,
			});
			return;
		}

		if (!selectedCTF) {
			await interaction.reply({
				content: `❌ Could not find the selected CTF. Please search again.`,
				flags: 64,
			});
			return;
		}

		const modal = new ModalBuilder()
			.setCustomId(
				`ctfadd|${encodeURIComponent(selectedCTF.id.toString())}`
			)
			.setTitle("Add CTF to Database");

		const nameInput = new TextInputBuilder()
			.setCustomId("name")
			.setLabel("Name")
			.setStyle(TextInputStyle.Short)
			.setValue(selectedCTF.title)
			.setRequired(true);

		const urlInput = new TextInputBuilder()
			.setCustomId("url")
			.setLabel("URL")
			.setStyle(TextInputStyle.Short)
			.setValue(selectedCTF.ctf_url || selectedCTF.url || "")
			.setRequired(true);

		const descriptionInput = new TextInputBuilder()
			.setCustomId("description")
			.setLabel("Description")
			.setStyle(TextInputStyle.Paragraph)
			.setValue(selectedCTF.description || "")
			.setRequired(true);

		const nameRow = new (ActionRowBuilder as any)().addComponents(
			nameInput
		);
		const urlRow = new (ActionRowBuilder as any)().addComponents(urlInput);
		const descriptionRow = new (ActionRowBuilder as any)().addComponents(
			descriptionInput
		);

		modal.addComponents(nameRow, urlRow, descriptionRow);

		await (interaction as any).showModal(modal);
	} catch (error) {
		console.error("Error in CTF selection:", error);
		try {
			if (!selectedCTF) {
				await interaction.reply({
					content:
						"❌ Could not retrieve CTF information. Please try again.",
					flags: 64,
				});
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle("🎯 Selected CTF")
				.setColor(0x00ff00)
				.addFields([
					{
						name: "Name",
						value: selectedCTF.title,
						inline: true,
					},
					{
						name: "URL",
						value:
							selectedCTF.ctf_url || selectedCTF.url || "No URL",
						inline: true,
					},
					{
						name: "Description",
						value:
							selectedCTF.description?.slice(0, 100) ||
							"No description",
					},
				])
				.setFooter({
					text: "Use /ctfadd command to add this CTF",
				});

			const row = new (ActionRowBuilder as any)().addComponents(
				new ButtonBuilder()
					.setCustomId(`quick-ctfadd:${selectedCTF.id}`)
					.setStyle(ButtonStyle.Primary)
					.setLabel("Add to Queue")
			);

			await interaction.reply({
				embeds: [embed],
				components: [row],
				flags: 64,
			});
		} catch (replyError) {
			console.error("Error sending fallback message:", replyError);
		}
	}
}

export async function handleClueSelect(interaction: any) {
	try {
		// Immediately ack to avoid 10062
		try {
			await interaction.deferUpdate();
		} catch {}
		const indexStr = interaction.values?.[0];
		const idx = parseInt(indexStr || "0", 10) || 0;
		const { serverDataStorage } = await import("../../utils/storage.js");
		const cur = serverDataStorage.read();
		const list = (cur.clues?.[interaction.channelId] ?? []) as any[];
		if (idx < 0 || idx >= list.length) {
			await interaction.reply({ content: "Invalid index.", flags: 64 });
			return;
		}
		const item = list[idx];
		const pageSize = 25;
		const page = Math.floor(idx / pageSize);

		const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } =
			await import("discord.js");

		const content: string = String(item.content || "");
		const chunks: string[] = [];
		const MAX_EMBED_DESC = 4000;
		for (let start = 0; start < content.length; start += MAX_EMBED_DESC) {
			chunks.push(
				content.slice(
					start,
					Math.min(start + MAX_EMBED_DESC, content.length)
				)
			);
			if (chunks.length >= 10) break; // Discord limits embeds per message
		}

		const embeds: any[] = [];
		const title = `#${idx + 1} ${item.title || "(no title)"}`;
		if (chunks.length === 0) {
			embeds.push(
				new EmbedBuilder()
					.setTitle(title)
					.setDescription("(empty)")
					.setColor(0x00a2ff)
					.setTimestamp(new Date())
			);
		} else {
			for (let i = 0; i < chunks.length; i++) {
				const e = new EmbedBuilder()
					.setTitle(i === 0 ? title : `${title} (cont. ${i + 1})`)
					.setDescription(chunks[i]!)
					.setColor(0x00a2ff)
					.setTimestamp(new Date());
				embeds.push(e);
			}
		}

		const backRow = new (ActionRowBuilder as any)().addComponents(
			new ButtonBuilder()
				.setCustomId(`clue-back:${page}`)
				.setStyle(ButtonStyle.Secondary)
				.setLabel("Back")
		);
		const actions = [backRow];

		await interaction.editReply({ embeds, components: actions });
	} catch (e) {
		try {
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({
					content: "Failed to load clue.",
					flags: 64,
				});
			} else {
				await interaction.reply({
					content: "Failed to load clue.",
					flags: 64,
				});
			}
		} catch {}
	}
}
