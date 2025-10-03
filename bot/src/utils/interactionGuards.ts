import { ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, ThreadChannel } from "discord.js";

const DEFAULT_ERROR =
	"This command can only be used inside a CTF challenge thread.";

export async function ensureForumThreadContext(
	interaction: ChatInputCommandInteraction,
	message: string = DEFAULT_ERROR
): Promise<ThreadChannel | null> {
	const channel = interaction.channel;
	const errorPayload = { content: message, flags: 64 } as const;

	if (!channel || !channel.isThread()) {
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp(errorPayload).catch(() => {});
		} else {
			await interaction.reply(errorPayload).catch(() => {});
		}
		return null;
	}

	if (channel.parent?.type !== ChannelType.GuildForum) {
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp(errorPayload).catch(() => {});
		} else {
			await interaction.reply(errorPayload).catch(() => {});
		}
		return null;
	}

	return channel as ThreadChannel;
}
