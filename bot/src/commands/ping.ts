import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
	.setName("ping")
	.setDescription("Replies with Pong!");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	await interaction.editReply("Pong!");
}
