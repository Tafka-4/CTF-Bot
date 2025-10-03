import type {
    ButtonInteraction,
    StringSelectMenuInteraction,
} from "discord.js";
import {
    buildPanelMessage,
    buildRequestDetailEmbed,
    deletePanelState,
    getPanelState,
    updatePanelState,
    PAGE_SIZE,
} from "../../utils/requestbinPanel.js";
import {
    getRequestBinRequests,
    RequestBinApiError,
} from "../../utils/requestbin.js";
import { serverDataStorage, type RequestBinRecord } from "../../utils/storage.js";

function sanitiseErrorMessage(err: unknown) {
    if (!(err instanceof Error) || !err.message) return "Unknown error";
    return err.message.length > 180 ? `${err.message.slice(0, 179)}…` : err.message;
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

function updateStoredRecord(userId: string, updates: Partial<RequestBinRecord>) {
    serverDataStorage.update((cur) => {
        const map = { ...(cur.requestBinsByUser ?? {}) };
        const current = map[userId];
        if (!current) return cur;
        const nextRecord: RequestBinRecord = { ...current };
        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) continue;
            (nextRecord as any)[key] = value;
        }
        map[userId] = { ...nextRecord, ownerUserId: userId };
        return { ...cur, requestBinsByUser: map };
    });
}

function ensureOwner(interactionUserId: string, ownerUserId: string): boolean {
    return interactionUserId === ownerUserId;
}

export async function handleRequestBinPanelButton(
    interaction: ButtonInteraction
) {
    const parts = interaction.customId.split(":");
    const action = parts[1];
    const panelId = parts[2];
    const pageStr = parts[3];

    await interaction.deferUpdate().catch(() => {});

    if (!panelId) {
        await interaction.editReply({
            content: "Invalid control panel interaction.",
            components: [],
            embeds: [],
        });
        return;
    }

    const state = getPanelState(panelId);
    if (!state) {
        await interaction.editReply({
            content:
                "This request bin panel expired. Please run `/requestbin show` again to reopen it.",
            components: [],
            embeds: [],
        });
        return;
    }

    if (!ensureOwner(interaction.user.id, state.ownerUserId)) {
        await interaction.followUp({
            content: "Only the request bin owner can use this control panel.",
            ephemeral: true,
        }).catch(() => {});
        return;
    }

    const page = Number.parseInt(pageStr ?? "0", 10) || 0;

    if (action === "page") {
        const response = buildPanelMessage(state, page);
        await interaction.editReply(response);
        return;
    }

    if (action === "refresh") {
        try {
            const refreshLimit = Math.min(50, PAGE_SIZE * 8);
            const requestData = await getRequestBinRequests(
                state.binId,
                state.token,
                refreshLimit
            );
            const summary = {
                ...requestData.bin,
                token: requestData.bin.token ?? state.token,
            };
            const updatedState = updatePanelState(state.id, {
                summary,
                requests: requestData.requests,
                total: requestData.total,
                token: summary.token ?? state.token,
            });
            const recordUpdates: Partial<RequestBinRecord> = {
                binId: summary.id,
                createdAt: summary.createdAt,
                expiresAt: summary.expiresAt,
                endpointUrl: summary.endpointUrl,
                inspectUrl: summary.inspectUrl,
            };
            if (summary.label && summary.label.trim().length > 0) {
                recordUpdates.label = summary.label;
            }
            updateStoredRecord(state.ownerUserId, recordUpdates);
            if (!updatedState) {
                throw new Error("Failed to update control panel state");
            }
            const response = buildPanelMessage(updatedState, page);
            await interaction.editReply({
                ...response,
                content:
                    requestData.requests.length === 0
                        ? "No requests captured yet. Waiting for traffic…"
                        : "Showing refreshed request data.",
            });
        } catch (error) {
            if (
                error instanceof RequestBinApiError &&
                (error.status === 404 || error.status === 403)
            ) {
                deletePanelState(panelId);
                removeStoredRecord(state.ownerUserId);
                await interaction.editReply({
                    content:
                        "This request bin is no longer available. Please create a new one with `/requestbin create`.",
                    components: [],
                    embeds: [],
                });
                return;
            }
            console.error("Failed to refresh request bin panel:", error);
            await interaction.followUp({
                content: `Failed to refresh: ${sanitiseErrorMessage(error)}`,
                ephemeral: true,
            }).catch(() => {});
        }
        return;
    }

    if (action === "close") {
        deletePanelState(panelId);
        await interaction.editReply({
            content: "Request bin control panel closed.",
            components: [],
            embeds: [],
        });
        return;
    }

    await interaction.followUp({
        content: "Unsupported action for this control panel.",
        ephemeral: true,
    }).catch(() => {});
}

export async function handleRequestBinDetailSelect(
    interaction: StringSelectMenuInteraction
) {
    const parts = interaction.customId.split(":");
    const panelId = parts[2];

    if (!panelId) {
        await interaction.reply({
            content: "Invalid control panel interaction.",
            ephemeral: true,
        });
        return;
    }

    const state = getPanelState(panelId);
    if (!state) {
        await interaction.reply({
            content:
                "This request bin panel expired. Please run `/requestbin show` again to reopen it.",
            ephemeral: true,
        });
        return;
    }

    if (!ensureOwner(interaction.user.id, state.ownerUserId)) {
        await interaction.reply({
            content: "Only the request bin owner can open request details.",
            ephemeral: true,
        });
        return;
    }

    const selectedId = interaction.values?.[0];
    if (!selectedId) {
        await interaction.reply({
            content: "Could not determine the selected request.",
            ephemeral: true,
        });
        return;
    }

    const idx = state.requests.findIndex((request) => request.id === selectedId);
    if (idx === -1) {
        await interaction.reply({
            content:
                "The selected request is no longer available. Try refreshing the panel.",
            ephemeral: true,
        });
        return;
    }

    const request = state.requests[idx]!;
    const embed = buildRequestDetailEmbed(state, request, idx);

    await interaction.reply({
        embeds: [embed],
        ephemeral: true,
    });
}
