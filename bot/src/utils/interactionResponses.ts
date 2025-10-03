import type {
	InteractionEditReplyOptions,
	InteractionReplyOptions,
} from "discord.js";

type ReplyPayload = string | InteractionReplyOptions;

type SafeReplyOptions = {
	fallbackContent?: string;
	preferEphemeral?: boolean;
};

function normaliseReplyPayload(
	payload: ReplyPayload,
	preferEphemeral: boolean
): InteractionReplyOptions {
	if (typeof payload === "string") {
		return { content: payload, ephemeral: preferEphemeral };
	}
	const base = { ...payload } as InteractionReplyOptions;
	if (preferEphemeral && base.ephemeral === undefined) {
		base.ephemeral = true;
	}
	return base;
}

function normaliseEditPayload(
	payload: ReplyPayload
): string | InteractionEditReplyOptions {
	if (typeof payload === "string") return payload;
	const { ephemeral, flags, ...rest } = payload;
	const clone: InteractionEditReplyOptions = { ...rest };
	return clone;
}

function isUnknownMessageError(error: unknown) {
	return (
		!!error &&
		typeof error === "object" &&
		"code" in error &&
		(error as { code?: number }).code === 10008
	);
}

export async function safeReply(
	interaction: any,
	payload: ReplyPayload,
	options: SafeReplyOptions = {}
): Promise<boolean> {
	const { fallbackContent, preferEphemeral = true } = options;
	try {
		if (interaction.deferred || interaction.replied) {
			const editPayload = normaliseEditPayload(payload);
			await interaction.editReply(editPayload);
		} else {
			const replyPayload = normaliseReplyPayload(
				payload,
				preferEphemeral
			);
			await interaction.reply(replyPayload);
		}
		return true;
	} catch (error) {
		if (!isUnknownMessageError(error)) {
			throw error;
		}
		const fallback =
			fallbackContent ??
			(typeof payload === "string" ? payload : payload.content);
		if (!fallback || !interaction?.user?.send) {
			return false;
		}
		try {
			await interaction.user.send(fallback);
			return true;
		} catch (dmError) {
			console.warn("Failed to deliver fallback DM message:", dmError);
			return false;
		}
	}
}

export async function safeFollowUp(
	interaction: any,
	payload: ReplyPayload,
	options: SafeReplyOptions = {}
): Promise<boolean> {
	const { fallbackContent, preferEphemeral = true } = options;
	try {
		const followUpPayload = normaliseReplyPayload(payload, preferEphemeral);
		await interaction.followUp(followUpPayload);
		return true;
	} catch (error) {
		if (!isUnknownMessageError(error)) {
			throw error;
		}
		const fallback =
			fallbackContent ??
			(typeof payload === "string" ? payload : payload.content);
		if (!fallback || !interaction?.user?.send) {
			return false;
		}
		try {
			await interaction.user.send(fallback);
			return true;
		} catch (dmError) {
			console.warn("Failed to deliver fallback DM message:", dmError);
			return false;
		}
	}
}
