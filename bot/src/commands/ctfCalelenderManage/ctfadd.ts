import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ChatInputCommandInteraction,
} from "discord.js";
import { fetchCtftimeEvent } from "../../utils/ctftime.js";

export const data = new SlashCommandBuilder()
	.setName("ctfadd")
	.setDescription("Add a CTF to the database")
	.addStringOption((o) =>
		o
			.setName("ctftime")
			.setDescription("CTFtime event URL or id (optional)")
			.setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const preset = interaction.options.getString("ctftime", false);

	const modal = new ModalBuilder()
		.setCustomId("ctfadd")
		.setTitle("Add a CTF to the database");

	const nameInput = new TextInputBuilder()
		.setCustomId("name")
		.setLabel("Name")
		.setPlaceholder("Enter CTF name")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const urlInput = new TextInputBuilder()
		.setCustomId("url")
		.setLabel("URL")
		.setPlaceholder("Enter CTF URL")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const descriptionInput = new TextInputBuilder()
		.setCustomId("description")
		.setLabel("Description")
		.setPlaceholder("Enter CTF description")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

	if (preset) {
		try {
			const ev = await fetchCtftimeEvent(preset);
			if (ev) {
				const url = ev.ctf_url || ev.url;
				const desc = (ev.description || "").slice(0, 400);
				nameInput.setValue(ev.title || "");
				urlInput.setValue(url || "");
				descriptionInput.setValue(desc || "");
			}
		} catch {}
		modal.setCustomId(`ctfadd|${encodeURIComponent(preset)}`);
	}

	const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		nameInput
	);
	const urlRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
		urlInput
	);
	const descriptionRow =
		new ActionRowBuilder<TextInputBuilder>().addComponents(
			descriptionInput
		);

	modal.addComponents(nameRow, urlRow, descriptionRow);

	await interaction.showModal(modal);
}
