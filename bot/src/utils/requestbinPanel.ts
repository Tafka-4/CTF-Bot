import { randomUUID } from "node:crypto";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	type APIEmbedField,
} from "discord.js";
import type { RequestBinRequest, RequestBinSummary } from "./requestbin.js";

const PANEL_TTL_MS = 10 * 60 * 1000;
export const PAGE_SIZE = 6;

export type RequestBinPanelState = {
	id: string;
	ownerUserId: string;
	binId: string;
	token: string;
	summary: RequestBinSummary;
	requests: RequestBinRequest[];
	total: number;
	createdAt: number;
	lastFetchedAt: number;
};

export type RequestBinPanelInput = {
	ownerUserId: string;
	binId: string;
	token: string;
	summary: RequestBinSummary;
	requests: RequestBinRequest[];
	total: number;
};

const panelStates = new Map<string, RequestBinPanelState>();

function cleanupExpiredPanels() {
	const now = Date.now();
	for (const [panelId, state] of panelStates.entries()) {
		if (now - state.createdAt > PANEL_TTL_MS) {
			panelStates.delete(panelId);
		}
	}
}

function truncateText(value: string, max = 90) {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

function formatRelativeTimestamp(iso: string | null | undefined) {
	if (!iso) return "Unknown";
	const ts = Math.floor(new Date(iso).getTime() / 1000);
	if (!Number.isFinite(ts)) return "Unknown";
	return `<t:${ts}:R>`;
}

function formatAbsoluteTimestamp(iso: string | null | undefined) {
	if (!iso) return "Unknown";
	const ts = Math.floor(new Date(iso).getTime() / 1000);
	if (!Number.isFinite(ts)) return iso;
	return `<t:${ts}:F>`;
}

function serialiseObject(obj: unknown) {
	if (obj == null) {
		return "(empty)";
	}
	if (typeof obj === "string") {
		if (obj.length === 0) return "(empty)";
		return obj.length <= 1000 ? obj : `${obj.slice(0, 997)}…`;
	}
	if (typeof obj !== "object") {
		return String(obj);
	}
	if (Array.isArray(obj) && obj.length === 0) {
		return "(empty array)";
	}
	try {
		const str = JSON.stringify(obj, null, 2);
		if (str.length <= 1000) {
			return `\`\`\`json\n${str}\n\`\`\``;
		}
		return `\`\`\`json\n${str.slice(0, 997)}…\n\`\`\``;
	} catch {
		const entries = Object.entries(obj)
			.map(([key, value]) => `${key}: ${String(value)}`)
			.join("\n");
		if (entries.length <= 1000) {
			return `\`\`\`\n${entries}\n\`\`\``;
		}
		return `\`\`\`\n${entries.slice(0, 997)}…\n\`\`\``;
	}
}

function serialiseHeaders(headers: Record<string, string>) {
	if (!headers || Object.keys(headers).length === 0) {
		return "(none)";
	}
	const lines = Object.entries(headers)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\n");
	if (lines.length <= 1000) {
		return `\`\`\`\n${lines}\n\`\`\``;
	}
	return `\`\`\`\n${lines.slice(0, 997)}…\n\`\`\``;
}

export function createPanelState(input: RequestBinPanelInput): string {
	cleanupExpiredPanels();
	const id = randomUUID().replace(/-/g, "").slice(0, 12);
	const now = Date.now();
	const state: RequestBinPanelState = {
		id,
		ownerUserId: input.ownerUserId,
		binId: input.binId,
		token: input.token,
		summary: input.summary,
		requests: input.requests,
		total: input.total,
		createdAt: now,
		lastFetchedAt: now,
	};
	panelStates.set(id, state);
	return id;
}

export function getPanelState(panelId: string): RequestBinPanelState | null {
	cleanupExpiredPanels();
	const state = panelStates.get(panelId);
	if (!state) return null;
	if (Date.now() - state.createdAt > PANEL_TTL_MS) {
		panelStates.delete(panelId);
		return null;
	}
	return state;
}

export function updatePanelState(
	panelId: string,
	updates: Partial<
		Pick<RequestBinPanelState, "summary" | "requests" | "total" | "token">
	>
): RequestBinPanelState | null {
	cleanupExpiredPanels();
	const existing = panelStates.get(panelId);
	if (!existing) return null;
	const updated: RequestBinPanelState = {
		...existing,
		...updates,
		summary: updates.summary ?? existing.summary,
		requests: updates.requests ?? existing.requests,
		total: updates.total ?? existing.total,
		token: updates.token ?? existing.token,
		lastFetchedAt: Date.now(),
	};
	panelStates.set(panelId, updated);
	return updated;
}

export function deletePanelState(panelId: string) {
	panelStates.delete(panelId);
}

function buildRequestField(
	request: RequestBinRequest,
	absoluteIndex: number
): APIEmbedField {
	const path = truncateText(request.path || "/", 40);
	const status =
		typeof request.statusCode === "number"
			? String(request.statusCode)
			: "-";
	const relative = formatRelativeTimestamp(request.createdAt);
	const absolute = formatAbsoluteTimestamp(request.createdAt);
	return {
		name: `#${absoluteIndex} ${request.method} ${path}`,
		value: `Status: ${status}\nTime: ${relative} (${absolute})`,
		inline: true,
	};
}

const BLANK_FIELD_INLINE: APIEmbedField = {
	name: "\u200b",
	value: "\u200b",
	inline: true,
};

const BLANK_FIELD_BREAK: APIEmbedField = {
	name: "\u200b",
	value: "\u200b",
	inline: false,
};

export function buildPanelMessage(state: RequestBinPanelState, page: number) {
	const totalPages = Math.max(
		1,
		Math.ceil(Math.max(state.total, state.requests.length) / PAGE_SIZE)
	);
	const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
	const startIndex = currentPage * PAGE_SIZE;
	const pageRequests = state.requests.slice(
		startIndex,
		startIndex + PAGE_SIZE
	);

	const embed = new EmbedBuilder()
		.setTitle(state.summary.label || "Request Bin Control Panel")
		.setColor(0x9b59b6)
		.setDescription(`**Send Requests:** ${state.summary.endpointUrl}`)
		.setFooter({
			text: `Bin ${state.summary.id} • Page ${
				currentPage + 1
			}/${totalPages}`,
		})
		.setTimestamp(new Date(state.summary.createdAt));

	embed.addFields({
		name: "Captured",
		value: `${state.total} request(s)`,
		inline: false,
	});

	embed.addFields({
		name: "Last request",
		value: state.summary.lastRequestAt
			? formatRelativeTimestamp(state.summary.lastRequestAt)
			: "None yet",
		inline: false,
	});

	if (pageRequests.length === 0) {
		embed.addFields({
			name: "Requests",
			value: "No requests captured yet.",
			inline: false,
		});
	} else {
		const fields: APIEmbedField[] = [];
		const columns = 3;
		const rows = Math.ceil(pageRequests.length / columns);
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < columns; col++) {
				const requestIndex = row * columns + col;
				const request = pageRequests[requestIndex];
				if (request) {
					const absoluteIndex = startIndex + requestIndex + 1;
					fields.push(buildRequestField(request, absoluteIndex));
				} else {
					fields.push({ ...BLANK_FIELD_INLINE });
				}
			}
			fields.push({ ...BLANK_FIELD_BREAK });
		}

		embed.addFields(...fields);
	}

	const prevButton = new ButtonBuilder()
		.setCustomId(`reqbin-panel:page:${state.id}:${currentPage - 1}`)
		.setLabel("Prev")
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(currentPage === 0);

	const nextButton = new ButtonBuilder()
		.setCustomId(`reqbin-panel:page:${state.id}:${currentPage + 1}`)
		.setLabel("Next")
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(
			currentPage >= totalPages - 1 || pageRequests.length === 0
		);

	const refreshButton = new ButtonBuilder()
		.setCustomId(`reqbin-panel:refresh:${state.id}:${currentPage}`)
		.setLabel("Refresh")
		.setStyle(ButtonStyle.Primary);

	const closeButton = new ButtonBuilder()
		.setCustomId(`reqbin-panel:close:${state.id}`)
		.setLabel("Close")
		.setStyle(ButtonStyle.Danger);

	const inspectButton = new ButtonBuilder()
		.setStyle(ButtonStyle.Link)
		.setURL(state.summary.inspectUrl)
		.setLabel("Open Inspect Page");

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		prevButton,
		nextButton,
		refreshButton,
		closeButton,
		inspectButton
	);

	const rows: Array<
		| ActionRowBuilder<ButtonBuilder>
		| ActionRowBuilder<StringSelectMenuBuilder>
	> = [buttonRow];

	if (pageRequests.length > 0) {
		const select = new StringSelectMenuBuilder()
			.setCustomId(`reqbin-panel:detail:${state.id}:${currentPage}`)
			.setPlaceholder("Select a request for details")
			.setMinValues(1)
			.setMaxValues(1);

		pageRequests.forEach((request, idx) => {
			const absoluteIndex = startIndex + idx + 1;
			const option = new StringSelectMenuOptionBuilder()
				.setLabel(
					truncateText(
						`${request.method} ${request.path || "/"}`,
						100
					)
				)
				.setDescription(
					truncateText(
						`Status ${
							typeof request.statusCode === "number"
								? request.statusCode
								: "-"
						} • ${formatRelativeTimestamp(request.createdAt)} • ${
							request.ip || "unknown"
						}`,
						100
					)
				)
				.setValue(request.id);
			select.addOptions(option);
		});

		rows.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				select
			)
		);
	}

	return {
		embeds: [embed],
		components: rows,
	};
}

function summariseBody(request: RequestBinRequest) {
	if (request.bodyJson !== undefined && request.bodyJson !== null) {
		return serialiseObject(request.bodyJson);
	}
	if (request.bodyText && request.bodyText.trim().length > 0) {
		const text =
			request.bodyText.length <= 1000
				? request.bodyText
				: `${request.bodyText.slice(0, 997)}…`;
		return `\`\`\`\n${text}\n\`\`\``;
	}
	return "(empty)";
}

export function buildRequestDetailEmbed(
	state: RequestBinPanelState,
	request: RequestBinRequest,
	index: number
) {
	const embed = new EmbedBuilder()
		.setTitle(`${request.method} ${request.path || "/"}`)
		.setColor(0x1abc9c)
		.setTimestamp(new Date(request.createdAt))
		.setFooter({
			text: `Bin ${state.summary.id} • Request ${index + 1} of ${
				state.total
			}`,
		});

	embed.addFields(
		{
			name: "Received",
			value: `${formatAbsoluteTimestamp(
				request.createdAt
			)} (${formatRelativeTimestamp(request.createdAt)})`,
		},
		{
			name: "Status Code",
			value:
				typeof request.statusCode === "number"
					? String(request.statusCode)
					: "Unknown",
			inline: true,
		},
		{ name: "Source IP", value: request.ip || "Unknown", inline: true },
		{
			name: "Content Length",
			value: `${request.contentLength} bytes`,
			inline: true,
		},
		{
			name: "Content Type",
			value: request.contentType || "(unspecified)",
			inline: true,
		},
		{ name: "Full URL", value: truncateText(request.fullUrl, 1024) },
		{ name: "Query", value: serialiseObject(request.query) },
		{ name: "Headers", value: serialiseHeaders(request.headers) },
		{
			name: `Body${request.truncated ? " (truncated)" : ""}`,
			value: summariseBody(request),
		}
	);

	return embed;
}
