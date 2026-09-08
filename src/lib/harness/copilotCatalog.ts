import { setHarnessModels, type AgentModel } from "../models";
import { resolveCopilotBinary } from "./child";

/**
 * Copilot ACP currently supports model switching but does not expose a model
 * listing method. Keep this fallback aligned with GitHub's Copilot CLI model
 * table; unavailable account-specific choices are rejected by the CLI.
 */
const COPILOT_MODELS: AgentModel[] = [
  { id: "copilot:auto", harness: "copilot", name: "Auto", nativeId: "auto" },
  {
    id: "copilot:claude-sonnet-4.6",
    harness: "copilot",
    name: "Claude Sonnet 4.6",
    nativeId: "claude-sonnet-4.6",
  },
  {
    id: "copilot:gpt-5.4",
    harness: "copilot",
    name: "GPT-5.4",
    nativeId: "gpt-5.4",
  },
  {
    id: "copilot:claude-haiku-4.5",
    harness: "copilot",
    name: "Claude Haiku 4.5",
    nativeId: "claude-haiku-4.5",
  },
  {
    id: "copilot:gpt-5.3-codex",
    harness: "copilot",
    name: "GPT-5.3-Codex",
    nativeId: "gpt-5.3-codex",
  },
  {
    id: "copilot:gemini-3.1-pro-preview",
    harness: "copilot",
    name: "Gemini 3.1 Pro",
    nativeId: "gemini-3.1-pro-preview",
  },
  {
    id: "copilot:gemini-3.5-flash",
    harness: "copilot",
    name: "Gemini 3.5 Flash",
    nativeId: "gemini-3.5-flash",
  },
  {
    id: "copilot:gemini-3.6-flash",
    harness: "copilot",
    name: "Gemini 3.6 Flash",
    nativeId: "gemini-3.6-flash",
  },
  {
    id: "copilot:gemini-3.7-flash",
    harness: "copilot",
    name: "Gemini 3.7 Flash",
    nativeId: "gemini-3.7-flash",
  },
  {
    id: "copilot:mai-code-1-flash",
    harness: "copilot",
    name: "MAI-Code-1-Flash",
    nativeId: "mai-code-1-flash",
  },
];

let inflight: Promise<void> | null = null;

export function refreshCopilotCatalog(): Promise<void> {
  if (inflight) return inflight;
  inflight = resolveCopilotBinary()
    .then(() => setHarnessModels("copilot", COPILOT_MODELS))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
