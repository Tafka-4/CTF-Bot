import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import type { CTFItem } from "../../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("ctfhistory")
	.setDescription("Show recently set current CTF items");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	const history = ctfQueueManager.getHistory();
	if (history.length === 0) {
		await interaction.editReply("History is empty.");
		return;
	}
	const lines = history.map((v: CTFItem, i: number) => `${i + 1}. ${v.name}`);
	await interaction.editReply(lines.join("\n"));
}
