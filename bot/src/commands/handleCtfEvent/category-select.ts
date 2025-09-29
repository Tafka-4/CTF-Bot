import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	Role,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { CATEGORIES } from "../../utils/challengeFlow.js";

export const data = new SlashCommandBuilder()
	.setName("category-select")
	.setDescription("Post role selection buttons for CTF categories")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });
	if (!interaction.guild || !interaction.channel) {
		await interaction.editReply(
			"This command must be used in a guild channel."
		);
		return;
	}

	// Ensure roles exist or instruct admin to create them
	const guild = interaction.guild;
	const rolesMap: Record<string, Role | null> = {};
	for (const name of CATEGORIES) {
		const role = guild.roles.cache.find((r) => r.name === name) || null;
		rolesMap[name] = role;
	}

	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	let row = new ActionRowBuilder<ButtonBuilder>();
	for (let i = 0; i < CATEGORIES.length; i++) {
		const cat = CATEGORIES[i] as string;
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`role-cat:${cat}`)
				.setLabel(cat)
				.setStyle(
					rolesMap[cat] ? ButtonStyle.Primary : ButtonStyle.Secondary
				)
		);
		if ((i + 1) % 5 === 0 || i === CATEGORIES.length - 1) {
			rows.push(row);
			row = new ActionRowBuilder<ButtonBuilder>();
		}
	}

	if (interaction.channel.isTextBased()) {
		await (interaction.channel as any).send({
			content:
				"Select categories to toggle roles. (Grey = role missing; create a role with exact name)",
			components: rows,
		});
	}

	await interaction.editReply("Category role buttons posted.");
}
