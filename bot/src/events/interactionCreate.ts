import { Events, type Interaction } from "discord.js";
import { ctfQueueManager } from "../utils/ctfQueueManager.js";
import { createCTFThread } from "../utils/ctfThreads.js";
import {
	buildCategoryButtonRows,
	showAddChallengeModal,
	saveChallenge,
	createAndSaveChallengePost,
} from "../utils/challengeFlow.js";
import { serverDataStorage } from "../utils/storage.js";

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction, client: any) {
	// Handle button clicks
	if (interaction.isButton()) {
		// Pagination for ctf-schedule list
		if (interaction.customId.startsWith("sched-")) {
			const [kind, pageStr] = interaction.customId.split(":");
			const page = parseInt(pageStr || "0", 10) || 0;
			const nextPage = kind === "sched-next" ? page + 1 : page - 1;
			import("../utils/ctfQueueManager.js").then(
				async ({ ctfQueueManager }) => {
					ctfQueueManager.loadQueue();
					const all = [...ctfQueueManager.getQueue()]
						.filter((q: any) => q.startAt)
						.sort(
							(a: any, b: any) =>
								Date.parse(a.startAt) - Date.parse(b.startAt)
						);
					const pageSize = 5;
					const totalPages = Math.max(
						1,
						Math.ceil(all.length / pageSize)
					);
					const p = Math.min(Math.max(0, nextPage), totalPages - 1);
					const {
						EmbedBuilder,
						ActionRowBuilder,
						ButtonBuilder,
						ButtonStyle,
					} = await import("discord.js");
					const embed = new EmbedBuilder()
						.setTitle("CTF Schedule")
						.setColor(0x000000) // black accent per team palette
						.setTimestamp(new Date())
						.setFooter({ text: `Page ${p + 1}/${totalPages}` });
					const slice = all.slice(
						p * pageSize,
						p * pageSize + pageSize
					);
					for (const q of slice) {
						const start = new Date(q.startAt as string);
						const now = new Date();
						const diffMs = start.getTime() - now.getTime();
						const sign = diffMs >= 0 ? "in" : "ago";
						const abs = Math.abs(diffMs);
						const hrs = Math.floor(abs / 3600000);
						const mins = Math.floor((abs % 3600000) / 60000);
						const rel = `${hrs}h ${mins}m ${sign}`;
						embed.addFields({
							name: `${q.name} ${
								q.started ? "(started)" : "(pending)"
							}`,
							value: `Start: ${start.toISOString()}\n${rel}\nURL: ${
								q.url
							}`,
						});
					}
					const row = new (ActionRowBuilder as any)().addComponents(
						new ButtonBuilder()
							.setCustomId(`sched-prev:${p}`)
							.setStyle(ButtonStyle.Secondary)
							.setLabel("Prev")
							.setDisabled(p === 0),
						new ButtonBuilder()
							.setCustomId(`sched-next:${p}`)
							.setStyle(ButtonStyle.Primary)
							.setLabel("Next")
							.setDisabled(totalPages <= 1)
					);
					await interaction.update({
						embeds: [embed],
						components: [row],
					});
				}
			);
			return;
		}
		if (interaction.customId.startsWith("add-challenge:")) {
			const [, category] = interaction.customId.split(":");
			await showAddChallengeModal(interaction, category || "Misc");
		}

		if (interaction.customId.startsWith("role-cat:")) {
			if (!interaction.guild) {
				await interaction.reply({
					content: "This action must be used in a guild.",
					ephemeral: true,
				});
				return;
			}
			const [, category] = interaction.customId.split(":");
			let role = interaction.guild.roles.cache.find(
				(r) => r.name === (category || "")
			);
			if (!role) {
				// Try to auto-create role (requires ManageRoles permission)
				const me = await interaction.guild.members.fetch(
					interaction.client.user.id
				);
				if (!me.permissions.has("ManageRoles")) {
					await interaction.reply({
						content: `Role '${category}' not found and I cannot create roles.`,
						ephemeral: true,
					});
					return;
				}
				role = await interaction.guild.roles.create({
					name: category || "",
				});
			}
			const member = await interaction.guild.members.fetch(
				interaction.user.id
			);
			const hasRole = member.roles.cache.has(role.id);
			if (hasRole) {
				await member.roles.remove(role);
				await interaction.reply({
					content: `Removed role: ${role.name}`,
					ephemeral: true,
				});
			} else {
				await member.roles.add(role);
				await interaction.reply({
					content: `Added role: ${role.name}`,
					ephemeral: true,
				});
			}
		}
		return;
	}
	// Handle modal submits (e.g., from /ctfadd)
	if (interaction.isModalSubmit()) {
		if (interaction.customId === "ctfadd") {
			try {
				const name = interaction.fields.getTextInputValue("name");
				const url = interaction.fields.getTextInputValue("url");
				const description =
					interaction.fields.getTextInputValue("description");

				const item = {
					name,
					url,
					description,
					createdAt: new Date().toISOString(),
					guildId: interaction.guildId || "",
					started: false,
				};

				ctfQueueManager.loadQueue();
				ctfQueueManager.addToQueue(item);

				// Create CTF thread and post management button
				if (interaction.guild) {
					const thread = await createCTFThread(
						interaction.guild,
						name
					);
					// Buttons are added by createCTFThread under bot management post
				}

				await interaction.reply({
					content: `CTF added and thread created: ${name}`,
					ephemeral: true,
				});
			} catch (err) {
				await interaction.reply({
					content: "Failed to add CTF. Please try again.",
					ephemeral: true,
				});
			}
		}

		if (interaction.customId.startsWith("add-challenge-modal:")) {
			try {
				const title = interaction.fields.getTextInputValue("title");
				const [, category] = interaction.customId.split(":");
				const desc = interaction.fields.getTextInputValue("desc");
				const ch = interaction.channel;
				if (ch && ch.isTextBased()) {
					await createAndSaveChallengePost(
						ch as any,
						interaction.channelId as string,
						{
							title,
							category: category || "Misc",
							desc,
							authorId: interaction.user.id,
						}
					);
				} else {
					saveChallenge(interaction.channelId as string, {
						title,
						category: category || "Misc",
						desc,
						authorId: interaction.user.id,
					});
				}
				await interaction.reply({
					content: `Challenge added: ${title}`,
					ephemeral: true,
				});
			} catch (err) {
				await interaction.reply({
					content: "Failed to add challenge.",
					ephemeral: true,
				});
			}
			return;
		}
		return;
	}

	// Handle slash commands
	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(
			`No command matching ${interaction.commandName} was found.`
		);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error: any) {
		console.error("Error executing command:", error);

		if (error.code === 10062) {
			console.error("Attempted to respond to an expired interaction.");
			return;
		}

		const errorMessage = "There was an error while executing this command!";

		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: errorMessage,
					ephemeral: true,
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					ephemeral: true,
				});
			}
		} catch (replyError) {
			console.error("Error sending error reply:", replyError);
		}
	}
}
