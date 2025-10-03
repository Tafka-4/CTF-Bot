import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { ensureForumThreadContext } from "../utils/interactionGuards.js";
import {
	createRequestBin,
	deleteRequestBin,
	getRequestBinRequests,
	getRequestBin,
	RequestBinApiError,
} from "../utils/requestbin.js";
import type {
	RequestBinSummary,
	CreateRequestBinInput,
} from "../utils/requestbin.js";
import {
	buildPanelMessage,
	createPanelState,
	getPanelState,
	PAGE_SIZE,
} from "../utils/requestbinPanel.js";
import { serverDataStorage, type RequestBinRecord } from "../utils/storage.js";

function truncate(value: string, max = 180) {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

function toTimestamp(dateIso: string | null | undefined) {
	if (!dateIso) return "Unknown";
	const ts = Math.floor(new Date(dateIso).getTime() / 1000);
	if (!Number.isFinite(ts)) return "Unknown";
	return `<t:${ts}:R>`;
}

function buildSummaryEmbed(
	summary: RequestBinSummary,
	title = "Request bin ready"
) {
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(0x9b59b6)
		.setDescription(`**Endpoint:** ${summary.endpointUrl}`)
		.setFooter({ text: `Bin ID: ${summary.id}` })
		.setTimestamp(new Date(summary.createdAt));

	if (summary.label) {
		embed.addFields({ name: "Label", value: summary.label });
	}

	embed.addFields({
		name: "Created",
		value: toTimestamp(summary.createdAt),
	});

	embed.addFields({
		name: "Expires",
		value: toTimestamp(summary.expiresAt),
	});

	if (summary.lastRequestAt) {
		embed.addFields({
			name: "Last request",
			value: toTimestamp(summary.lastRequestAt),
		});
	}

	embed.addFields({
		name: "Captured",
		value: `${summary.requestCount} request(s)`,
	});

	return embed;
}

function removeStoredRecord(userId: string) {
	serverDataStorage.update((cur) => {
		const map = { ...(cur.requestBinsByUser ?? {}) };
		if (!map[userId]) return cur;
		delete map[userId];
		const next: typeof cur = { ...cur };
		if (Object.keys(map).length > 0) {
			next.requestBinsByUser = map;
		} else {
			delete next.requestBinsByUser;
		}
		return next;
	});
}

function storeRecord(userId: string, record: RequestBinRecord) {
	serverDataStorage.update((cur) => {
		const map = { ...(cur.requestBinsByUser ?? {}) };
		map[userId] = { ...record, ownerUserId: userId };
		return { ...cur, requestBinsByUser: map };
	});
}

function sanitiseErrorMessage(err: unknown) {
	if (!(err instanceof Error) || !err.message) return "Unknown error";
	return truncate(err.message, 180);
}

export const data = new SlashCommandBuilder()
	.setName("requestbin")
	.setDescription("Manage your personal request bin")
	.addSubcommand((sub) =>
		sub
			.setName("create")
			.setDescription("Create your personal request bin")
			.addStringOption((opt) =>
				opt
					.setName("label")
					.setDescription(
						"Optional label to store with the request bin"
					)
			)
	)
	.addSubcommand((sub) =>
		sub.setName("show").setDescription("Show your request bin links")
	)
	.addSubcommand((sub) =>
		sub.setName("delete").setDescription("Delete your personal request bin")
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const subcommand = interaction.options.getSubcommand();
	await interaction.deferReply({ ephemeral: true });
	const thread = await ensureForumThreadContext(interaction);
	if (!thread) return;

	const userId = interaction.user.id;
	const storedMap = serverDataStorage.read().requestBinsByUser ?? {};
	let stored = storedMap[userId];
	if (stored && !stored.token) {
		removeStoredRecord(userId);
		stored = undefined;
	}

	if (subcommand === "create") {
		if (stored) {
			try {
				const summary = await getRequestBin(stored.binId, stored.token);
				await interaction.editReply({
					embeds: [
						buildSummaryEmbed(
							summary,
							"Request bin already exists"
						),
					],
				});
				return;
			} catch (error) {
				if (
					error instanceof RequestBinApiError &&
					(error.status === 404 || error.status === 403)
				) {
					removeStoredRecord(userId);
					stored = undefined;
				} else {
					console.error(
						"Failed to load existing request bin:",
						error
					);
					await interaction.editReply({
						content: `Failed to load existing request bin: ${sanitiseErrorMessage(
							error
						)}`,
					});
					return;
				}
			}
		}

		const labelInput = interaction.options.getString("label");
		const label =
			labelInput?.trim() || `${interaction.user.username}'s bin`;
		try {
			const createPayload: CreateRequestBinInput = {
				threadId: thread.id,
				userId,
			};
			if (label) createPayload.label = label;
			if (interaction.guildId)
				createPayload.guildId = interaction.guildId;
			if (thread.parentId) createPayload.channelId = thread.parentId;

			const summary = await createRequestBin(createPayload);
			const secret = summary.token ?? undefined;
			if (!secret) {
				throw new Error(
					"RequestBin service did not return an access token"
				);
			}
			const record: RequestBinRecord = {
				ownerUserId: userId,
				binId: summary.id,
				label: summary.label ?? label,
				createdAt: summary.createdAt,
				expiresAt: summary.expiresAt,
				endpointUrl: summary.endpointUrl,
				inspectUrl: summary.inspectUrl,
				token: secret,
			};
			if (interaction.guildId) {
				record.guildId = interaction.guildId;
			}
			record.lastThreadId = thread.id;
			if (thread.parentId) {
				record.lastChannelId = thread.parentId;
			}
			storeRecord(userId, record);
			const summaryEmbed = buildSummaryEmbed(summary);
			summaryEmbed.addFields({ name: "Owner", value: `<@${userId}>` });
			await interaction.editReply({
				embeds: [summaryEmbed],
			});
		} catch (error) {
			console.error("Failed to create request bin:", error);
			await interaction.editReply({
				content: `Failed to create request bin: ${sanitiseErrorMessage(
					error
				)}`,
			});
		}
		return;
	}

	if (!stored) {
		await interaction.editReply({
			content:
				"You do not have an active request bin yet. Use `/requestbin create` first.",
		});
		return;
	}

	if (subcommand === "show") {
		try {
			const initialLimit = Math.min(50, PAGE_SIZE * 8);
			const requestData = await getRequestBinRequests(
				stored.binId,
				stored.token,
				initialLimit
			);
			const summary = {
				...requestData.bin,
				token: requestData.bin.token ?? stored.token,
			};
			const updatedRecord: RequestBinRecord = {
				...stored,
				ownerUserId: userId,
				binId: summary.id,
				createdAt: summary.createdAt,
				expiresAt: summary.expiresAt,
				endpointUrl: summary.endpointUrl,
				inspectUrl: summary.inspectUrl,
				token: stored.token,
				lastThreadId: thread.id,
			};
			const nextLabel = summary.label ?? stored.label;
			if (nextLabel && nextLabel.trim().length > 0) {
				updatedRecord.label = nextLabel;
			} else {
				delete updatedRecord.label;
			}
			if (thread.parentId) {
				updatedRecord.lastChannelId = thread.parentId;
			}
			storeRecord(userId, updatedRecord);

			const panelId = createPanelState({
				ownerUserId: userId,
				binId: summary.id,
				token: stored.token,
				summary,
				requests: requestData.requests,
				total: requestData.total,
			});
			const panelState = getPanelState(panelId);
			if (!panelState) {
				throw new Error(
					"Failed to initialise request bin control panel"
				);
			}
			const panelMessage = buildPanelMessage(panelState, 0);
			await interaction.editReply({
				embeds: panelMessage.embeds,
				components: panelMessage.components,
				content:
					requestData.requests.length === 0
						? "No requests captured yet. Waiting for traffic…"
						: "Use the control panel below to browse captured requests.",
			});
		} catch (error) {
			if (
				error instanceof RequestBinApiError &&
				(error.status === 404 || error.status === 403)
			) {
				removeStoredRecord(userId);
				await interaction.editReply({
					content:
						"Your request bin is no longer available. Please create a new one with `/requestbin create`.",
					components: [],
					embeds: [],
				});
				return;
			}
			console.error("Failed to load request bin:", error);
			await interaction.editReply({
				content: `Failed to load request bin: ${sanitiseErrorMessage(
					error
				)}`,
			});
		}
		return;
	}

	if (subcommand === "delete") {
		try {
			await deleteRequestBin(stored.binId, stored.token);
		} catch (error) {
			if (
				!(
					error instanceof RequestBinApiError &&
					(error.status === 404 || error.status === 403)
				)
			) {
				console.error("Failed to delete request bin:", error);
				await interaction.editReply({
					content: `Failed to delete request bin: ${sanitiseErrorMessage(
						error
					)}`,
				});
				return;
			}
		}

		removeStoredRecord(userId);
		await interaction.editReply({
			content: "Your request bin has been removed.",
		});
		return;
	}
}
