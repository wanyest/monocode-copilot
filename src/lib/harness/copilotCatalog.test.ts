import { describe, expect, it } from "vitest";
import { copilotModelsFromList } from "./copilotCatalog";

describe("GitHub Copilot model catalog", () => {
  it("maps the authenticated CLI catalog and keeps account-specific models", () => {
    expect(
      copilotModelsFromList([
        { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
        { id: "gpt-6-astra", name: "GPT-6 Astra" },
        { id: "org-custom-model", name: "Organization model" },
      ]),
    ).toEqual([
      {
        id: "copilot:auto",
        harness: "copilot",
        name: "Auto",
        nativeId: "auto",
      },
      {
        id: "copilot:claude-sonnet-5",
        harness: "copilot",
        name: "Claude Sonnet 5",
        nativeId: "claude-sonnet-5",
      },
      {
        id: "copilot:gpt-6-astra",
        harness: "copilot",
        name: "GPT-6 Astra",
        nativeId: "gpt-6-astra",
      },
      {
        id: "copilot:org-custom-model",
        harness: "copilot",
        name: "Organization model",
        nativeId: "org-custom-model",
      },
    ]);
  });

  it("deduplicates IDs, ignores malformed entries, and supplies missing names", () => {
    expect(
      copilotModelsFromList([
        { id: "auto", name: "Automatic" },
        { id: "gpt-5.6-sol", name: "" },
        { id: "gpt-5.6-sol", name: "Duplicate" },
        { id: "" },
        null,
      ]),
    ).toEqual([
      {
        id: "copilot:auto",
        harness: "copilot",
        name: "Auto",
        nativeId: "auto",
      },
      {
        id: "copilot:gpt-5.6-sol",
        harness: "copilot",
        name: "gpt-5.6-sol",
        nativeId: "gpt-5.6-sol",
      },
    ]);
  });
});
