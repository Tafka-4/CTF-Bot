import { serverDataStorage } from "./storage.js";

export async function sendCTFParticipationMessage(
	client: any,
	ctfItem: any
): Promise<{ success: boolean; messageId?: string }> {
	try {
		const { EmbedBuilder } = await import("discord.js");

		const startTime = new Date(ctfItem.startAt);
		const embed = new EmbedBuilder()
			.setTitle("🎯 CTF Participation Check")
			.setColor(0x00ff00)
			.setDescription(
				"React with ✅ to confirm your participation in this CTF!"
			)
			.addFields(
				{ name: "📅 CTF Name", value: ctfItem.name, inline: true },
				{
					name: "🔗 URL",
					value: `[Link](${ctfItem.url})`,
					inline: true,
				},
				{
					name: "⏰ Start Time",
					value: `<t:${Math.floor(startTime.getTime() / 1000)}:F>`,
					inline: true,
				}
			)
			.setFooter({
				text: "React with ✅ to confirm your participation",
			})
			.setTimestamp();

		const result = await serverDataStorage.sendNoticeMessage(
			client,
			"🎯 CTF Participation Check",
			{
				embeds: [embed],
			}
		);

		if (result.success && result.messageId) {
			try {
				const noticeChannelId = serverDataStorage.getNoticeChannelId();
				if (noticeChannelId) {
					const channel = await client.channels.fetch(
						noticeChannelId
					);
					if (channel && channel.isTextBased()) {
						const message = await channel.messages.fetch(
							result.messageId
						);
						await message.react("✅");
						console.log(`✅ Emoji added: ${result.messageId}`);
					}
				}
			} catch (emojiError) {
				console.error("Emoji addition failed:", emojiError);
			}
		}

		return result;
	} catch (error) {
		console.error("Failed to send CTF participation message:", error);
		return { success: false };
	}
}
