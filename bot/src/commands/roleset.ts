import { SlashCommandBuilder } from "@discordjs/builders";
import {
	ChatInputCommandInteraction,
	TextChannel,
	Role,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
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

const ROLE_CATEGORIES = ["web", "pwn", "rev", "crypto"];

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
	await guild.roles.fetch();
	const selfMember = guild.members.me;
	if (!selfMember) {
		await interaction.editReply(
			"Unable to resolve bot member in this guild. Please try again later."
		);
		return;
	}
	const canManageRoles = selfMember.permissions.has(PermissionFlagsBits.ManageRoles);

	const resolvedRoles: Array<{ category: string; role: Role; created: boolean }>
		= [];

	for (const category of ROLE_CATEGORIES) {
		const roleName = category.charAt(0).toUpperCase() + category.slice(1);
		let role = guild.roles.cache.find(
			(r) => r.name.toLowerCase() === roleName.toLowerCase()
		);

		if (!role) {
			if (!canManageRoles) {
				await interaction.editReply(
					`❌ Missing permission to create role "${roleName}". Please create it manually and rerun the command.`
				);
				return;
			}
			try {
				role = await guild.roles.create({
					name: roleName,
					mentionable: true,
					reason: `Auto-created by /roleset for ${interaction.user.tag}`,
				});
				resolvedRoles.push({ category, role, created: true });
			} catch (error) {
				console.error("Failed to create role", roleName, error);
				await interaction.editReply(
					`❌ Failed to create role "${roleName}". Please check my permissions and try again.`
				);
				return;
			}
		} else {
			resolvedRoles.push({ category, role, created: false });
		}
	}

	const categoryButtons: ActionRowBuilder<ButtonBuilder>[] = [];
	let currentRow = new ActionRowBuilder<ButtonBuilder>();

	for (let i = 0; i < resolvedRoles.length; i++) {
		const entry = resolvedRoles[i];
		if (!entry) continue;
		const { category, role } = entry;
		const roleName = role.name;

		currentRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`role-category:${role.id}:${category}`)
				.setLabel(roleName)
				.setStyle(ButtonStyle.Primary)
		);

		if ((i + 1) % 5 === 0 || i === resolvedRoles.length - 1) {
			categoryButtons.push(currentRow);
			currentRow = new ActionRowBuilder<ButtonBuilder>();
		}
	}

	const embed = new EmbedBuilder()
		.setTitle("🎯 Role Selection")
		.setDescription(
			"Click the buttons below to toggle challenge category roles."
		)
		.setColor(0x00ff00)
		.setTimestamp();

	const message = await channel.send({
		embeds: [embed],
		components: categoryButtons,
	});

	serverDataStorage.update((current) => ({
		...current,
		roleSelectionMessage: {
			channelId: channel.id,
			messageId: message.id,
			guildId: guild.id,
		},
	}));

	const createdSummary = resolvedRoles
		.filter((entry) => entry.created)
		.map((entry) => entry.role.toString())
		.join(", ");

	await interaction.editReply(
		`✅ Role selection message created successfully in ${channel} channel!${
			createdSummary ? ` Created roles: ${createdSummary}` : ""
		}`
	);
}
