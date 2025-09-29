import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctfcurrent")
	.setDescription("Show current CTF");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const cur = ctfQueueManager.getCurrent();
	if (!cur) {
		await interaction.editReply("No current CTF.");
		return;
	}
	await interaction.editReply(`${cur.name} - ${cur.url}`);
}
