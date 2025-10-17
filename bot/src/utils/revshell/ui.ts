import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
} from "discord.js";
import type {
	RevshellCommandMode,
	RevshellCommandVariants,
	RevshellConnectionInfo,
	RevshellPairingSummary,
} from "./types.js";

type BuildEmbedOptions = {
	pairing: RevshellPairingSummary;
	connection: RevshellConnectionInfo;
	variants: RevshellCommandVariants;
	mode: RevshellCommandMode;
};

export function buildRevshellCommandEmbed({
	pairing,
	connection,
	variants,
	mode,
}: BuildEmbedOptions) {
	const commands =
		mode === "tls" ? variants.tls : variants.plain;
	const modeLabel =
		mode === "tls"
			? "TLS (`openssl s_client`)"
			: "Plain TCP (`nc`)";
	const tip =
		mode === "tls"
			? "현재 TLS 명령을 표시합니다. 같은 Tailscale 네트워크나 내부망에서 평문 접속이 필요하면 아래 버튼으로 Plain 모드를 선택하세요."
			: "현재 평문 TCP 명령을 표시합니다. Cloudflare/Tailscale Funnel 등 TLS 종단이 필요하면 아래 버튼으로 TLS 모드를 선택하세요.";

	return new EmbedBuilder()
		.setTitle("🔑 Reverse Shell Session Ready")
		.setColor(0x1abc9c)
		.addFields(
			{
				name: "Session Key",
				value: `\`${pairing.key}\``,
			},
			{
				name: "Listener",
				value: `${connection.host}:${connection.port}`,
			},
			{
				name: "Mode",
				value: modeLabel,
			},
			{
				name: "Operator",
				value: `\`\`\`bash\n${commands.operator}\n\`\`\``,
			},
			{
				name: "Target",
				value: `\`\`\`bash\n${commands.target}\n\`\`\``,
			},
			{
				name: "Guide",
				value: tip,
			}
		)
		.setFooter({
			text: "첫 줄에 AUTH <key> <role> 을 보내야 연결됩니다",
		})
		.setTimestamp(new Date(pairing.createdAt));
}

export function buildRevshellCommandComponents(
	pairingKey: string,
	activeMode: RevshellCommandMode
) {
	const plainButton = new ButtonBuilder()
		.setCustomId(`revshell-mode:plain:${pairingKey}`)
		.setLabel("Plain TCP")
		.setStyle(
			activeMode === "plain"
				? ButtonStyle.Primary
				: ButtonStyle.Secondary
		)
		.setDisabled(activeMode === "plain");

	const tlsButton = new ButtonBuilder()
		.setCustomId(`revshell-mode:tls:${pairingKey}`)
		.setLabel("TLS")
		.setStyle(
			activeMode === "tls"
				? ButtonStyle.Primary
				: ButtonStyle.Secondary
		)
		.setDisabled(activeMode === "tls");

	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			plainButton,
			tlsButton
		),
	];
}
