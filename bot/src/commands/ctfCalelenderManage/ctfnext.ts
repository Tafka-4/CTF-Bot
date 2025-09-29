import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../utils/ctfQueueManager.js";

export const data = new SlashCommandBuilder()
	.setName("ctfnext")
	.setDescription("Pop next CTF from queue and set as current");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	ctfQueueManager.loadQueue();
	const next = ctfQueueManager.popFromQueue();
	if (!next) {
		await interaction.editReply("Queue is empty.");
		return;
	}
	ctfQueueManager.setCurrent(next);
	ctfQueueManager.appendHistory(next);
	await interaction.editReply(`Current CTF set: ${next.name}`);
}
