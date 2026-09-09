import { setHarnessModels, type AgentModel } from "../models";
import { listCopilotModels } from "./child";

const AUTO_MODEL: AgentModel = {
  id: "copilot:auto",
  harness: "copilot",
  name: "Auto",
  nativeId: "auto",
};

/**
 * Used only when the authenticated CLI catalog cannot be reached. The primary
 * path is Copilot SDK's `models.list`, which reflects the signed-in account,
 * its plan, organization policy, and newly released models.
 */
const OFFICIAL_FALLBACK_MODELS = [
  ["gpt-5-mini", "GPT-5 mini"],
  ["gpt-5.3-codex", "GPT-5.3-Codex"],
  ["gpt-5.4", "GPT-5.4"],
  ["gpt-5.4-mini", "GPT-5.4 mini"],
  ["gpt-5.5", "GPT-5.5"],
  ["gpt-5.6-luna", "GPT-5.6 Luna"],
  ["gpt-5.6-sol", "GPT-5.6 Sol"],
  ["gpt-5.6-terra", "GPT-5.6 Terra"],
  ["gpt-6-astra", "GPT-6 Astra"],
  ["claude-fable-5", "Claude Fable 5"],
  ["claude-fable-5.1", "Claude Fable 5.1"],
  ["claude-haiku-4.5", "Claude Haiku 4.5"],
  ["claude-opus-4.7", "Claude Opus 4.7"],
  ["claude-opus-4.8", "Claude Opus 4.8"],
  ["claude-opus-4.8-fast", "Claude Opus 4.8 (fast mode)"],
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-sonnet-4.6", "Claude Sonnet 4.6"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["gemini-3.5-flash", "Gemini 3.5 Flash"],
  ["gemini-3.6-flash", "Gemini 3.6 Flash"],
  ["gemini-3.7-flash", "Gemini 3.7 Flash"],
  ["gemini-3.8-flash", "Gemini 3.8 Flash"],
  ["mai-code-1-flash", "MAI-Code-1-Flash"],
  ["mai-code-1.1-flash", "MAI-Code-1.1-Flash"],
  ["kimi-k2.7-code", "Kimi K2.7 Code"],
  ["kimi-k3", "Kimi K3"],
  ["grok-4.5", "Grok 4.5"],
  ["grok-4.6", "Grok 4.6"],
] as const;

export const COPILOT_FALLBACK_MODELS: AgentModel[] = [
  AUTO_MODEL,
  ...OFFICIAL_FALLBACK_MODELS.map(([nativeId, name]) => ({
    id: `copilot:${nativeId}`,
    harness: "copilot" as const,
    name,
    nativeId,
  })),
];

let inflight: Promise<void> | null = null;

export function refreshCopilotCatalog(): Promise<void> {
  if (inflight) return inflight;
  inflight = listCopilotModels()
    .then((rows) => {
      const models = copilotModelsFromList(rows);
      setHarnessModels(
        "copilot",
        models.length > 1 ? models : COPILOT_FALLBACK_MODELS,
      );
    })
    .catch((error: unknown) => {
      console.debug("[monocode] copilot catalog", error);
      setHarnessModels("copilot", COPILOT_FALLBACK_MODELS);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function copilotModelsFromList(rows: unknown): AgentModel[] {
  if (!Array.isArray(rows)) return [AUTO_MODEL];
  const models: AgentModel[] = [AUTO_MODEL];
  const seen = new Set(["auto"]);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const nativeId = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!nativeId || seen.has(nativeId)) continue;
    seen.add(nativeId);
    const name =
      typeof rec.name === "string" && rec.name.trim()
        ? rec.name.trim()
        : nativeId;
    models.push({
      id: `copilot:${nativeId}`,
      harness: "copilot",
      name,
      nativeId,
    });
  }
  return models;
}
