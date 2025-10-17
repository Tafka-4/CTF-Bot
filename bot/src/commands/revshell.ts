import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
	createRevshellPairing,
	getRevshellPairing,
	getRevshellLogs,
	closeRevshellPairing,
	type RevshellPairingSummary,
	type RevshellLogEntry,
} from "../utils/revshell/client.js";
import {
	serverDataStorage,
	type RevshellUserRecord,
} from "../utils/storage.js";
import {
	setRevshellCommandCache,
	deleteRevshellCommandCache,
} from "../utils/revshell/commandCache.js";
import {
	buildRevshellCommandComponents,
	buildRevshellCommandEmbed,
} from "../utils/revshell/ui.js";

function getRevshellUserRecord(userId: string): RevshellUserRecord | undefined {
	const map = serverDataStorage.read().revshellByUser ?? {};
	return map[userId];
}

function upsertRevshellUserRecord(
	userId: string,
	patch: Partial<
		Omit<RevshellUserRecord, "ownerUserId" | "createdAt" | "updatedAt">
	>
) {
	serverDataStorage.update((cur) => {
		const map = { ...(cur.revshellByUser ?? {}) };
		const existing = map[userId];
		const now = new Date().toISOString();
		const next: RevshellUserRecord = {
			ownerUserId: userId,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		};
		if (existing) {
			for (const [key, value] of Object.entries(existing)) {
				if (
					key === "ownerUserId" ||
					key === "createdAt" ||
					key === "updatedAt"
				)
					continue;
				(next as any)[key] = value;
			}
		}
		for (const [key, value] of Object.entries(patch)) {
			if (value === null || value === undefined) {
				delete (next as any)[key];
			} else {
				(next as any)[key] = value;
			}
		}
		map[userId] = next;
		return { ...cur, revshellByUser: map };
	});
}

function buildPairingEmbed(
	pairing: RevshellPairingSummary,
	logs?: RevshellLogEntry[]
) {
	const embed = new EmbedBuilder()
		.setTitle("Reverse Shell Session")
		.setColor(0x3498db)
		.addFields(
			{ name: "Session Key", value: `\`${pairing.key}\`` },
			{
				name: "Status",
				value: `${pairing.status} • Operator: ${
					pairing.operatorConnected ? "🟢" : "⚪"
				} • Target: ${pairing.targetConnected ? "🟢" : "⚪"}`,
			},
			{
				name: "Created",
				value: new Date(pairing.createdAt).toLocaleString(),
				inline: true,
			},
			{
				name: "Last activity",
				value: new Date(pairing.lastActivityAt).toLocaleString(),
				inline: true,
			}
		);
	if (pairing.closeReason) {
		embed.addFields({
			name: "Closed",
			value: `${pairing.closeReason} (${pairing.closedAt ?? "unknown"})`,
		});
	}
	if (logs && logs.length > 0) {
		const recent = logs
			.slice(-5)
			.map(
				(log) =>
					`[#${log.seq} • ${log.source}] ${
						log.preview.length > 0
							? log.preview
							: `<${log.size} bytes>`
					}`
			)
			.join("\n");
		embed.addFields({ name: "Recent activity", value: recent });
	}
	return embed;
}

export const data = new SlashCommandBuilder()
	.setName("revshell")
	.setDescription("Reverse shell session management")
	.addSubcommand((sub) =>
		sub
			.setName("create")
			.setDescription("세션 키를 생성하고 연결 명령을 안내합니다")
	)
	.addSubcommand((sub) =>
		sub
			.setName("status")
			.setDescription("세션 상태를 확인합니다")
			.addStringOption((opt) =>
				opt.setName("key").setDescription("확인할 세션 키")
			)
	)
	.addSubcommand((sub) =>
		sub
			.setName("close")
			.setDescription("세션을 종료합니다")
			.addStringOption((opt) =>
				opt.setName("key").setDescription("종료할 세션 키")
			)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	const sub = interaction.options.getSubcommand();

	if (sub === "create") {
		await interaction.deferReply({ ephemeral: true });
		try {
			const response = await createRevshellPairing({
				ownerUserId: interaction.user.id,
			});
			const { pairing, connection, commands } = response;
			const defaultMode = commands.defaultMode;
			setRevshellCommandCache(pairing.key, {
				ownerUserId: interaction.user.id,
				connection,
				pairing,
				variants: commands,
				defaultMode,
			});
			const embed = buildRevshellCommandEmbed({
				pairing,
				connection,
				variants: commands,
				mode: defaultMode,
			});
			const components = buildRevshellCommandComponents(
				pairing.key,
				defaultMode
			);

			const threadId =
				interaction.channel?.isThread?.() === true
					? interaction.channelId
					: undefined;
			const patch: Partial<
				Omit<
					RevshellUserRecord,
					"ownerUserId" | "createdAt" | "updatedAt"
				>
			> = {
				lastChannelId: interaction.channelId,
				lastPairingKey: pairing.key,
			};
			if (threadId) patch.lastThreadId = threadId;
			if (interaction.guildId) patch.guildId = interaction.guildId;
			upsertRevshellUserRecord(interaction.user.id, patch);

			await interaction.editReply({
				embeds: [embed],
				components,
			});
		} catch (error) {
			console.error("Failed to create reverse shell pairing:", error);
			await interaction.editReply({
				content:
					error instanceof Error && error.message
						? `세션 생성 실패: ${error.message}`
						: "세션 생성 중 알 수 없는 오류가 발생했습니다.",
			});
		}
		return;
	}

	if (sub === "status") {
		await interaction.deferReply({ ephemeral: true });
		const keyOption = interaction.options.getString("key");
		const record = getRevshellUserRecord(interaction.user.id);
		const targetKey = keyOption || record?.lastPairingKey;
		if (!targetKey) {
			await interaction.editReply(
				"조회할 세션 키가 없습니다. 먼저 `/revshell create`를 실행해주세요."
			);
			return;
		}
		try {
			const summary = await getRevshellPairing(targetKey);
			const logsResponse = await getRevshellLogs(targetKey);
			const embed = buildPairingEmbed(summary, logsResponse.logs);
			await interaction.editReply({ embeds: [embed] });
			if (!keyOption) {
				upsertRevshellUserRecord(interaction.user.id, {
					lastPairingKey: summary.key,
				});
			}
		} catch (error) {
			console.error("Failed to fetch pairing status:", error);
			await interaction.editReply({
				content:
					error instanceof Error && error.message
						? `세션 조회 실패: ${error.message}`
						: "세션 정보를 불러오지 못했습니다.",
			});
		}
		return;
	}

	if (sub === "close") {
		await interaction.deferReply({ ephemeral: true });
		const keyOption = interaction.options.getString("key");
		const record = getRevshellUserRecord(interaction.user.id);
		const targetKey = keyOption || record?.lastPairingKey;
		if (!targetKey) {
			await interaction.editReply(
				"종료할 세션 키가 없습니다. `/revshell create`로 세션을 만든 뒤 다시 시도하세요."
			);
			return;
		}
		try {
			const pairing = await closeRevshellPairing(targetKey);
			deleteRevshellCommandCache(targetKey);
			const embed = buildPairingEmbed(pairing);
			const patch: Partial<
				Omit<
					RevshellUserRecord,
					"ownerUserId" | "createdAt" | "updatedAt"
				>
			> = {};
			if (record?.lastPairingKey && record.lastPairingKey !== targetKey) {
				patch.lastPairingKey = record.lastPairingKey;
			} else if (record?.lastPairingKey === targetKey) {
				patch.lastPairingKey = null;
			}
			upsertRevshellUserRecord(interaction.user.id, patch);
			await interaction.editReply({
				content: `세션 ${targetKey}을(를) 종료했습니다.`,
				embeds: [embed],
				components: [],
			});
		} catch (error) {
			console.error("Failed to close pairing:", error);
			await interaction.editReply({
				content:
					error instanceof Error && error.message
						? `세션 종료 실패: ${error.message}`
						: "세션 종료 중 오류가 발생했습니다.",
			});
		}
		return;
	}

	await interaction.reply({
		content: "지원하지 않는 서브커맨드입니다.",
		flags: 64,
		ephemeral: true,
	});
}
