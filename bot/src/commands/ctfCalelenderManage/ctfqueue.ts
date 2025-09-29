import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctfqueue")
	.setDescription("Show queued CTF items");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	ctfQueueManager.loadQueue();
	const q = ctfQueueManager.getQueue();
	if (q.length === 0) {
		await interaction.editReply("Queue is empty.");
		return;
	}
	const lines = q.map((v, i) => `${i + 1}. ${v.name} - ${v.url}`);
	await interaction.editReply(lines.join("\n"));
}
