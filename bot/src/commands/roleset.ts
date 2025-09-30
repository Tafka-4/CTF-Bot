import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	TextChannel,
	Role,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
} from "discord.js";
import { serverDataStorage } from "../utils/storage.js";

export const data = new SlashCommandBuilder()
	.setName("roleset")
	.setDescription("Setup role selection message in specified channel")
	.addChannelOption((option) =>
		option
			.setName("channel")
			.setDescription("Channel to send role selection message")
			.setRequired(true)
	);

const ROLE_CATEGORIES = ["web", "pwn", "rev", "crypto", "misc", "ai", "osint"];
const MAIN_ROLES = ["H4cker", "Cat"];

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true });

	if (!interaction.guild) {
		await interaction.editReply(
			"This command can only be used in a server."
		);
		return;
	}

	const channel = interaction.options.getChannel(
		"channel",
		true
	) as TextChannel;

	if (!channel.isTextBased()) {
		await interaction.editReply("Only text channels can be specified.");
		return;
	}

	const serverData = serverDataStorage.read();
	const existingRoleMessage = serverData.roleSelectionMessage;

	if (existingRoleMessage) {
		await interaction.editReply(
			"A role selection message already exists. Please delete the existing message before creating a new one."
		);
		return;
	}

	const guild = interaction.guild;
	const rolesMap: Record<string, Role | null> = {};

	for (const roleName of MAIN_ROLES) {
		let role = guild.roles.cache.find((r) => r.name === roleName);
		if (!role) {
			await interaction.editReply(
				`Role ${roleName} does not exist. Please create the role before using it.`
			);
			rolesMap[roleName] = null;
		} else {
			rolesMap[roleName] = role;
		}
	}

	for (const category of ROLE_CATEGORIES) {
		const roleName = category.charAt(0).toUpperCase() + category.slice(1);
		let role = guild.roles.cache.find((r) => r.name === roleName);
		if (!role) {
			await interaction.editReply(
				`Role ${roleName} does not exist. Please create the role before using it.`
			);
			rolesMap[roleName] = null;
		} else {
			rolesMap[roleName] = role || null;
		}
	}

	const mainRoleButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("role-main:H4cker")
			.setLabel("H4cker")
			.setStyle(
				rolesMap["H4cker"] ? ButtonStyle.Primary : ButtonStyle.Secondary
			),
		new ButtonBuilder()
			.setCustomId("role-main:Cat")
			.setLabel("Cat")
			.setStyle(
				rolesMap["Cat"] ? ButtonStyle.Primary : ButtonStyle.Secondary
			)
	);

	const categoryButtons: ActionRowBuilder<ButtonBuilder>[] = [];
	let currentRow = new ActionRowBuilder<ButtonBuilder>();

	for (let i = 0; i < ROLE_CATEGORIES.length; i++) {
		const category = ROLE_CATEGORIES[i];
		if (!category) continue;
		const roleName = category.charAt(0).toUpperCase() + category.slice(1);

		currentRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`role-category:${category}`)
				.setLabel(roleName)
				.setStyle(
					rolesMap[roleName]
						? ButtonStyle.Primary
						: ButtonStyle.Secondary
				)
		);

		if ((i + 1) % 5 === 0 || i === ROLE_CATEGORIES.length - 1) {
			categoryButtons.push(currentRow);
			currentRow = new ActionRowBuilder<ButtonBuilder>();
		}
	}

	const embed = new EmbedBuilder()
		.setTitle("🎯 Role Selection")
		.setDescription(
			"Click the buttons below to select roles!\n\n**Main Roles:**\n**Category Roles:** (Multiple selection possible)"
		)
		.setColor(0x00ff00)
		.setTimestamp();

	const message = await channel.send({
		embeds: [embed],
		components: [mainRoleButtons, ...categoryButtons],
	});

	serverDataStorage.update((current) => ({
		...current,
		roleSelectionMessage: {
			channelId: channel.id,
			messageId: message.id,
			guildId: guild.id,
		},
	}));

	await interaction.editReply(
		`✅ Role selection message created successfully in ${channel} channel!`
	);
}
