import { spawn } from "node:child_process";
import { providerLaunch } from "./process";

type CopilotModel = {
  id: string;
  name: string;
  contextWindow?: number;
  longContextWindow?: number;
  supportsLongContext: boolean;
};

/** The SDK transport uses Content-Length frames, unlike ACP's JSON lines. */
export async function queryCopilotModels(
  path: string,
): Promise<CopilotModel[]> {
  const launch = await providerLaunch(path, [
    "--headless",
    "--stdio",
    "--no-auto-update",
  ]);
  const child = spawn(launch.command, launch.args, {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let settled = false;
    let expectedId = 1;
    const finish = (models?: CopilotModel[], error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(models ?? []);
    };
    const timer = setTimeout(
      () => finish(undefined, new Error("Copilot model discovery timed out")),
      20_000,
    );
    const send = (id: number, method: string, params: unknown) => {
      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      child.stdin.write(
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
    };
    child.on("error", (error) => finish(undefined, error));
    child.stdin.on("error", (error) => finish(undefined, error));
    child.on("exit", () =>
      finish(
        undefined,
        new Error("Copilot CLI closed before returning models"),
      ),
    );
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      buffer = Buffer.concat([buffer, chunk]);
      try {
        if (buffer.length > 16 * 1024 * 1024)
          throw new Error("Copilot response is unexpectedly large");
        while (!settled) {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) return;
          const length = Number(
            /^Content-Length:\s*(\d+)\s*$/im.exec(
              buffer.subarray(0, headerEnd).toString(),
            )?.[1],
          );
          if (
            !Number.isSafeInteger(length) ||
            length <= 0 ||
            length > 16 * 1024 * 1024
          )
            throw new Error("Invalid Copilot response Content-Length");
          const end = headerEnd + 4 + length;
          if (buffer.length < end) return;
          const message = JSON.parse(
            buffer.subarray(headerEnd + 4, end).toString(),
          );
          buffer = buffer.subarray(end);
          if (message.id !== expectedId) continue;
          if (message.error)
            throw new Error(
              `Copilot CLI request failed: ${String(message.error.message)}`,
            );
          if (expectedId === 1) {
            expectedId = 2;
            send(2, "models.list", {});
          } else {
            const models = normalizeCopilotModels(message.result?.models);
            if (!models.length)
              throw new Error("Copilot CLI returned no available models");
            finish(models);
          }
        }
      } catch (error) {
        finish(
          undefined,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
    send(1, "connect", { supportedTaskKinds: ["agent", "client", "shell"] });
  });
}

function normalizeCopilotModels(rows: unknown): CopilotModel[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const limits = row.capabilities?.limits;
    const contextWindow = positive(
      limits?.max_context_window_tokens ?? limits?.maxContextWindowTokens,
    );
    const output = positive(
      limits?.max_output_tokens ?? limits?.maxOutputTokens,
    );
    const prices = row.billing?.tokenPrices ?? row.billing?.token_prices;
    const long = prices?.longContext ?? prices?.long_context;
    const prompt = positive(long?.maxPromptTokens ?? long?.max_prompt_tokens);
    const tiers = row.supportedContextTiers ?? row.supported_context_tiers;
    return [
      {
        id,
        name:
          typeof row.name === "string" && row.name.trim()
            ? row.name.trim()
            : id,
        contextWindow,
        longContextWindow: prompt ? prompt + (output ?? 0) : undefined,
        supportsLongContext:
          (long != null && typeof long === "object") ||
          (Array.isArray(tiers) && tiers.includes("long_context")),
      },
    ];
  });
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
