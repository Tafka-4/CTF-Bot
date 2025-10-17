import type { ButtonInteraction } from "discord.js";
import {
	getRevshellCommandCache,
	updateRevshellCommandMode,
} from "../../utils/revshell/commandCache.js";
import {
	buildRevshellCommandComponents,
	buildRevshellCommandEmbed,
} from "../../utils/revshell/ui.js";
import type { RevshellCommandMode } from "../../utils/revshell/types.js";

function parseCustomId(customId: string) {
	const parts = customId.split(":");
	return {
		mode: parts[1] as RevshellCommandMode | undefined,
		key: parts[2],
	};
}

export async function handleRevshellCommandModeButton(
	interaction: ButtonInteraction
) {
	const { mode, key } = parseCustomId(interaction.customId);
	if (!mode || (mode !== "plain" && mode !== "tls") || !key) {
		await interaction.reply({
			content: "잘못된 리버스 셸 선택 버튼입니다.",
			ephemeral: true,
		});
		return;
	}

	const cacheEntry = getRevshellCommandCache(key);
	if (!cacheEntry) {
		await interaction.reply({
			content:
				"이 세션 정보가 만료되었습니다. `/revshell create`로 새로 만들어 주세요.",
			ephemeral: true,
		});
		return;
	}

	if (interaction.user.id !== cacheEntry.ownerUserId) {
		await interaction.reply({
			content: "세션 소유자만 명령 유형을 변경할 수 있습니다.",
			ephemeral: true,
		});
		return;
	}

	updateRevshellCommandMode(key, mode);

	const embed = buildRevshellCommandEmbed({
		pairing: cacheEntry.pairing,
		connection: cacheEntry.connection,
		variants: cacheEntry.variants,
		mode,
	});
	const components = buildRevshellCommandComponents(key, mode);

	await interaction.update({
		embeds: [embed],
		components,
	});
}
