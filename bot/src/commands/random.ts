import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
	.setName("random")
	.setDescription("Replies with a random number!")
	.addIntegerOption((option: any) =>
		option.setName("min").setDescription("최솟값").setRequired(true)
	)
	.addIntegerOption((option: any) =>
		option.setName("max").setDescription("최댓값").setRequired(true)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();
	const min = interaction.options.getInteger("min", true);
	const max = interaction.options.getInteger("max", true);
	const random = Math.floor(Math.random() * (max - min + 1)) + min;
	await interaction.editReply(`Random number: ${random}`);
}
