import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctfhistory")
	.setDescription("Show recently set current CTF items");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	const history = ctfQueueManager.getHistory();
	if (history.length === 0) {
		await interaction.editReply("History is empty.");
		return;
	}
	const lines = history.map((v, i) => `${i + 1}. ${v.name} - ${v.url}`);
	await interaction.editReply(lines.join("\n"));
}
