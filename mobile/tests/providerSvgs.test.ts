import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MONOCHROME_PROVIDERS, PROVIDER_SVGS } from "@/features/sessions/providerSvgs";
import type { Harness } from "@/features/workspace/types";

describe("provider marks", () => {
  it("supports Copilot sessions with the desktop's tintable mark", () => {
    const harness: Harness = "copilot";
    const desktopMark = readFileSync(
      resolve(import.meta.dirname, "../../src/assets/providers/copilot.svg"),
      "utf8",
    );

    expect(PROVIDER_SVGS[harness]).toBe(desktopMark);
    expect(MONOCHROME_PROVIDERS.has(harness)).toBe(true);
  });
});
