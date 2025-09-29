import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ChatInputCommandInteraction,
} from "discord.js";

export const data = new SlashCommandBuilder()
	.setName("ctfadd")
	.setDescription("Add a CTF to the database");

export async function execute(interaction: ChatInputCommandInteraction) {
	const modal = new ModalBuilder()
		.setCustomId("ctfadd")
		.setTitle("Add a CTF to the database");

	const nameInput = new TextInputBuilder()
		.setCustomId("name")
		.setLabel("Name")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const urlInput = new TextInputBuilder()
		.setCustomId("url")
		.setLabel("URL")
		.setStyle(TextInputStyle.Short)
		.setRequired(true);

	const descriptionInput = new TextInputBuilder()
		.setCustomId("description")
		.setLabel("Description")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

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
