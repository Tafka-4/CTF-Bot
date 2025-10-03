import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	PermissionFlagsBits,
	GuildMember,
	Role,
} from "discord.js";
import { ctfQueueManager } from "../../utils/ctfQueueManager.js";
import { ctftimeToQueueItem } from "../../utils/ctftime.js";
import { serverDataStorage } from "../../utils/storage.js";
import { getCachedResults, setCachedResults } from "./cache.js";

export async function handleSchedulePagination(interaction: any) {
	const [kind, pageStr] = interaction.customId.split(":");
	const page = parseInt(pageStr || "0", 10) || 0;
	const nextPage = kind === "sched-next" ? page + 1 : page - 1;

	ctfQueueManager.loadQueue();
	const all = [...ctfQueueManager.getQueue()]
		.filter((q: any) => q.startAt)
		.sort(
			(a: any, b: any) => Date.parse(a.startAt) - Date.parse(b.startAt)
		);

	const pageSize = 5;
	const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
	const p = Math.min(Math.max(0, nextPage), totalPages - 1);

	const embed = new EmbedBuilder()
		.setTitle("CTF Schedule")
		.setColor(0x000000)
		.setTimestamp(new Date())
		.setFooter({ text: `Page ${p + 1}/${totalPages}` });

	const slice = all.slice(p * pageSize, p * pageSize + pageSize);

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
			name: `${q.name} ${q.started ? "(started)" : "(pending)"}`,
			value: `Start: ${start.toISOString()}\n${rel}\nURL: ${q.url}`,
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

export async function handleAddChallengeModal(interaction: any) {
	const [, category] = interaction.customId.split(":");

	if (category) {
		const { showAddChallengeModal } = await import(
			"../../utils/challengeFlow.js"
		);
		await showAddChallengeModal(interaction, category);
	} else {
		await interaction.reply({
			content: "Invalid category specified.",
			flags: 64,
		});
	}
}

export async function handleClueAddButton(interaction: any) {
	try {
		const {
			ModalBuilder,
			TextInputBuilder,
			TextInputStyle,
			ActionRowBuilder,
		} = await import("discord.js");
		const modal = new ModalBuilder()
			.setCustomId("add-clue-modal")
			.setTitle("Add Clue");
		const title = new TextInputBuilder()
			.setCustomId("title")
			.setLabel("Title")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
		const content = new TextInputBuilder()
			.setCustomId("content")
			.setLabel("Content")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);
		const titleRow = new (ActionRowBuilder as any)().addComponents(title);
		const contentRow = new (ActionRowBuilder as any)().addComponents(
			content
		);
		modal.addComponents(titleRow, contentRow);
		await (interaction as any).showModal(modal);
	} catch (e) {
		await interaction.reply({
			content: "Failed to open clue modal.",
			flags: 64,
		});
	}
}

export async function handleCluePagination(interaction: any) {
	try {
		try {
			await interaction.deferUpdate();
		} catch {}
		const [kind, pageStr] = interaction.customId.split(":");
		const page = parseInt(pageStr || "0", 10) || 0;
		let nextPage = page;
		if (kind === "clue-next") nextPage = page + 1;
		else if (kind === "clue-prev") nextPage = page - 1;
		else if (kind === "clue-back") nextPage = page;

		const { serverDataStorage } = await import("../../utils/storage.js");
		const {
			EmbedBuilder,
			ActionRowBuilder,
			ButtonBuilder,
			ButtonStyle,
			StringSelectMenuBuilder,
		} = await import("discord.js");

		const list = (serverDataStorage.read().clues?.[interaction.channelId] ??
			[]) as any[];
		const pageSize = 25;
		const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
		const p = Math.min(Math.max(0, nextPage), totalPages - 1);

		// Build single page embed
		const embed = new EmbedBuilder()
			.setTitle("Clues")
			.setColor(0x00a2ff)
			.setFooter({ text: `Page ${p + 1}/${totalPages}` })
			.setTimestamp(new Date());
		const slice = list.slice(p * pageSize, p * pageSize + pageSize);
		if (slice.length === 0) {
			embed.setDescription("No clues yet. Use /clue add to create one.");
		} else {
			for (let i = 0; i < slice.length; i++) {
				const idx = p * pageSize + i;
				embed.addFields({
					name: `${idx + 1}. ${slice[i]?.title || "(no title)"}`,
					value: "\u200b",
				});
			}
		}

		// Nav row
		const navRow = new (ActionRowBuilder as any)().addComponents(
			new ButtonBuilder()
				.setCustomId(`clue-prev:${p}`)
				.setStyle(ButtonStyle.Secondary)
				.setLabel("Prev")
				.setDisabled(p === 0),
			new ButtonBuilder()
				.setCustomId(`clue-next:${p}`)
				.setStyle(ButtonStyle.Primary)
				.setLabel("Next")
				.setDisabled(totalPages <= 1)
		);


		// Select menu row for current page
		const rows: any[] = [navRow];
		if (slice.length > 0) {
			const menu = new StringSelectMenuBuilder()
				.setCustomId("clue-select")
				.setPlaceholder("Select a clue to view")
				.setMaxValues(1);
			for (let i = 0; i < slice.length; i++) {
				const absoluteIndex = p * pageSize + i;
				menu.addOptions({
					label: `${absoluteIndex + 1}. ${
						slice[i]?.title || "(no title)"
					}`,
					value: String(absoluteIndex),
				});
			}
			rows.push(new (ActionRowBuilder as any)().addComponents(menu));
		}

		await interaction.editReply({ embeds: [embed], components: rows });
	} catch (e) {
		try {
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({
					content: "Failed to paginate clues.",
					flags: 64,
				});
			} else {
				await interaction.reply({
					content: "Failed to paginate clues.",
					flags: 64,
				});
			}
		} catch {}
	}
}

export async function handleCTFSearchPagination(interaction: any) {
	const [kind, qEnc, timeframe, pageStr] = interaction.customId.split(":");
	const q = decodeURIComponent(qEnc || "");
	const curPage = parseInt(pageStr || "0", 10) || 0;
	const nextPage = kind === "ctfs-next" ? curPage + 1 : curPage - 1;

	const { searchCtftimeEvents } = await import("../../utils/ctftime.js");
	const PAGE_SIZE = 5;

	const safeQ = q || "";
	const safeTimeframe = timeframe || "upcoming";
	let searchResult = getCachedResults(safeQ, safeTimeframe, nextPage);

	if (!searchResult) {
		searchResult = await searchCtftimeEvents(
			safeQ,
			safeTimeframe as any,
			nextPage,
			PAGE_SIZE
		);
		setCachedResults(
			safeQ,
			safeTimeframe,
			nextPage,
			searchResult.total,
			searchResult.items
		);
	}

	const { total, items } = searchResult;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const p = Math.min(Math.max(0, nextPage), totalPages - 1);

	const embed = new EmbedBuilder()
		.setTitle(`CTFtime search: ${q}`)
		.setFooter({ text: `Page ${p + 1}/${totalPages}` })
		.setColor(0x00a2ff)
		.setTimestamp(new Date());

	if (items.length === 0) {
		embed.setDescription("❌ No CTF events found matching your search.");
	} else {
		let resultsText = `🔍 **Showing ${items.length} of ${total} result${
			items.length === 1 ? "" : "s"
		}:**\n\n`;

		for (let i = 0; i < items.length; i++) {
			const e = items[i]!;
			const start = e.start
				? new Date(e.start).toLocaleDateString()
				: "TBD";
			const finish = e.finish
				? new Date(e.finish).toLocaleDateString()
				: "TBD";

			resultsText += `**${i + 1}.** ${e.title} (ID: ${e.id})\n`;
			resultsText += `📅 ${start} - ${finish}\n`;
			resultsText += `🔗 ${e.ctf_url || e.url || "No URL"}\n\n`;
		}

		resultsText += `💡 **Tip:** Use the selector below to add a CTF to your server.`;

		embed.setDescription(resultsText);
	}

	const row = new (ActionRowBuilder as any)().addComponents(
		new ButtonBuilder()
			.setCustomId(
				`ctfs-prev:${encodeURIComponent(q || "")}:${
					timeframe || "upcoming"
				}:${p}`
			)
			.setStyle(ButtonStyle.Secondary)
			.setLabel("Prev")
			.setDisabled(p === 0),
		new ButtonBuilder()
			.setCustomId(
				`ctfs-next:${encodeURIComponent(q || "")}:${
					timeframe || "upcoming"
				}:${p}`
			)
			.setStyle(ButtonStyle.Primary)
			.setLabel("Next")
		.setDisabled(p >= totalPages - 1)
	);

	const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } =
		await import("discord.js");
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(
			`ctfs-select:${encodeURIComponent(q || "")}:${
				timeframe || "upcoming"
			}:${p}`
		)
		.setPlaceholder("🎯 Select a CTF to add to your server")
		.setMaxValues(1);

	for (let i = 0; i < items.length; i++) {
		const e = items[i]!;
		const start = e.start ? new Date(e.start).toLocaleDateString() : "TBD";
		const finish = e.finish
			? new Date(e.finish).toLocaleDateString()
			: "TBD";

		selectMenu.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel(`${i + 1}. ${e.title}`)
				.setDescription(`📅 ${start} - ${finish} | ID: ${e.id}`)
				.setValue(e.id.toString())
				.setEmoji("🎯")
		);
	}

	const selectRow = new ActionRowBuilder().addComponents(selectMenu);

	await interaction.update({
		embeds: [embed],
		components: items.length > 0 ? [row, selectRow] : [row],
	});
}

export async function handleCTFAddButton(interaction: any) {
	const [, idStr] = interaction.customId.split(":");
	const id = parseInt(idStr || "0", 10) || 0;

	try {
		const { fetchCtftimeEvent } = await import("../../utils/ctftime.js");
		const ev = await fetchCtftimeEvent(String(id));

		if (!ev) {
			await interaction.reply({
				content: "Event not found.",
				flags: 64,
			});
			return;
		}

		const url = ev.ctf_url || ev.url || "";
		const name = ev.title || "";
		const desc = (ev.description || "").slice(0, 400);

		const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import(
			"discord.js"
		);
		const modal = new ModalBuilder()
			.setCustomId(`ctfadd|${id}`)
			.setTitle("Add a CTF to the database");

		const nameInput = new TextInputBuilder()
			.setCustomId("name")
			.setLabel("Name")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setValue(name);

		const urlInput = new TextInputBuilder()
			.setCustomId("url")
			.setLabel("URL")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setValue(url);

		const descriptionInput = new TextInputBuilder()
			.setCustomId("description")
			.setLabel("Description")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setValue(desc);

		const { ActionRowBuilder } = await import("discord.js");
		const nameRow = new (ActionRowBuilder as any)().addComponents(
			nameInput
		);
		const urlRow = new (ActionRowBuilder as any)().addComponents(urlInput);
		const descriptionRow = new (ActionRowBuilder as any)().addComponents(
			descriptionInput
		);

		modal.addComponents(nameRow, urlRow, descriptionRow);
		await (interaction as any).showModal(modal);
	} catch (e) {
		await interaction.reply({
			content: "Failed to open add modal.",
			flags: 64,
		});
	}
}

export async function handleQuickCTFAdd(interaction: any) {
	const [, idStr] = interaction.customId.split(":");
	const id = parseInt(idStr || "0", 10) || 0;

	try {
		const mod = await import("../../utils/ctftime.js");
		const eventData = await mod.fetchCtftimeEvent(id.toString());

		if (eventData) {
			const {
				ModalBuilder,
				TextInputBuilder,
				TextInputStyle,
				ActionRowBuilder,
			} = await import("discord.js");

			const modal = new ModalBuilder()
				.setCustomId(`ctfadd|${encodeURIComponent(id)}`)
				.setTitle("Add CTF to Database");

			const nameInput = new TextInputBuilder()
				.setCustomId("name")
				.setLabel("Name")
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setValue(eventData.title);

			const urlInput = new TextInputBuilder()
				.setCustomId("url")
				.setLabel("URL")
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setValue(eventData.ctf_url || eventData.url || "");

			const descriptionInput = new TextInputBuilder()
				.setCustomId("description")
				.setLabel("Description")
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setValue(eventData.description || "");

			const nameRow = new (ActionRowBuilder as any)().addComponents(
				nameInput
			);
			const urlRow = new (ActionRowBuilder as any)().addComponents(
				urlInput
			);
			const descriptionRow =
				new (ActionRowBuilder as any)().addComponents(descriptionInput);

			modal.addComponents(nameRow, urlRow, descriptionRow);

			await (interaction as any).showModal(modal);
		} else {
			await interaction.reply({
				content:
					"❌ Could not fetch CTF data. Please try searching first.",
				flags: 64,
			});
		}
	} catch (error) {
		console.error("Error in quick-ctfadd:", error);
		await interaction.reply({
			content: "❌ Failed to open CTF add modal.",
			flags: 64,
		});
	}
}


function inferRoleNameFromCategory(category?: string) {
	if (!category) return undefined;
	return category.charAt(0).toUpperCase() + category.slice(1);
}

async function resolveRoleFromCustomId(
	interaction: any,
	identifier?: string,
	extra?: string
): Promise<Role | null> {
	if (!interaction.guild) return null;
	let role: Role | null = null;
	if (identifier) {
		// Try treat identifier as role ID first
		role =
			interaction.guild.roles.cache.get(identifier) ??
			(await interaction.guild.roles
				.fetch(identifier)
				.catch(() => null));
	}
	const possibleNames = [extra, identifier]
		.filter(Boolean)
		.map((name) => name as string);
	const inferredName = inferRoleNameFromCategory(possibleNames[0]);
	if (inferredName) possibleNames.push(inferredName);
	if (!role) {
		await interaction.guild.roles.fetch();
		role = interaction.guild.roles.cache.find((r: Role) =>
			possibleNames.some(
				(name) => name && r.name.toLowerCase() === name.toLowerCase()
			)
		);
	}
	return role ?? null;
}

async function ensureGuildMember(interaction: any): Promise<GuildMember | null> {
	if (!interaction.guild) return null;
	const cached = interaction.guild.members.cache.get(interaction.user.id);
	if (cached) return cached;
	return await interaction.guild.members
		.fetch(interaction.user.id)
		.catch(() => null);
}

export async function handleRoleManagement(interaction: any) {
	const parts = interaction.customId.split(":");
	const action = parts[0];
	const identifier = parts[1];
	const extra = parts[2];

	if (!interaction.guild) {
		await interaction.reply({
			content: "❌ This interaction can only be used inside a server.",
			flags: 64,
		});
		return;
	}

	try {
		const role = await resolveRoleFromCustomId(
			interaction,
			identifier,
			action === "role-category" ? extra : parts[2] ?? identifier
		);
		if (!role) {
			await interaction.reply({
				content:
					"❌ Unable to locate that role. Please rerun `/roleset` to regenerate the role panel.",
				flags: 64,
			});
			return;
		}

		const botMember = interaction.guild.members.me;
		if (!botMember) {
			await interaction.reply({
				content: "❌ Unable to resolve bot member in this guild.",
				flags: 64,
			});
			return;
		}
		if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
			await interaction.reply({
				content:
					"❌ I don't have permission to manage roles. Please grant the Manage Roles permission and try again.",
				flags: 64,
			});
			return;
		}
		if (botMember.roles.highest.comparePositionTo(role) <= 0) {
			await interaction.reply({
				content:
					"❌ My highest role is not high enough to modify this role. Please adjust the role hierarchy and try again.",
				flags: 64,
			});
			return;
		}
		if (role.managed) {
			await interaction.reply({
				content: "❌ This role is managed externally and cannot be assigned manually.",
				flags: 64,
			});
			return;
		}

		const member = await ensureGuildMember(interaction);
		if (!member) {
			await interaction.reply({
				content: "❌ Could not resolve your member profile. Please try again.",
				flags: 64,
			});
			return;
		}

		const hasRole = member.roles.cache.has(role.id);
		if (hasRole) {
			await member.roles.remove(role);
			await interaction.reply({
				content: `✅ Removed the ${role.name} role.`,
				flags: 64,
			});
		} else {
			await member.roles.add(role);
			await interaction.reply({
				content: `✅ Added the ${role.name} role.`,
				flags: 64,
			});
		}
	} catch (error) {
		console.error("Error assigning/removing roles:", error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: "❌ Error assigning/removing roles.",
				flags: 64,
			}).catch(() => {});
		} else {
			await interaction.reply({
				content: "❌ Error assigning/removing roles.",
				flags: 64,
			});
		}
	}
}
