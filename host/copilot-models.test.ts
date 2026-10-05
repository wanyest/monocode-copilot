import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostChildBackend } from "./child-backend";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture(result: unknown, error = false) {
  const directory = mkdtempSync(join(tmpdir(), "monocode-copilot-catalog-"));
  directories.push(directory);
  const path = join(directory, "copilot.cjs");
  writeFileSync(
    path,
    `
    let buffer = Buffer.alloc(0);
    function frame(message) {
      const body = JSON.stringify(message);
      return Buffer.from('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body);
    }
    process.stdin.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
      if (headerEnd < 0) return;
      const size = Number(/Content-Length: (\\d+)/.exec(buffer.subarray(0, headerEnd).toString())[1]);
      if (buffer.length < headerEnd + 4 + size) return;
      const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + size));
      buffer = buffer.subarray(headerEnd + 4 + size);
      if (message.method === 'connect') {
        process.stdout.write(frame({ jsonrpc: '2.0', method: 'status.changed', params: {} }));
        process.stdout.write(frame({ jsonrpc: '2.0', id: message.id, result: {} }));
      } else if (message.method === 'models.list') {
        const output = frame({ jsonrpc: '2.0', id: message.id, ${error ? "error" : "result"}: ${JSON.stringify(result)} });
        process.stdout.write(output.subarray(0, 8));
        setTimeout(() => process.stdout.write(output.subarray(8)), 5);
      } else process.exit(1);
    });
  `,
  );
  return new HostChildBackend({ copilot: path });
}

it("discovers Copilot models on a host through framed SDK RPC and preserves extended context", async () => {
  const backend = fixture({
    models: [
      {
        id: "gpt-6.1-sol",
        name: "GPT-6.1 Sol",
        capabilities: {
          limits: {
            max_context_window_tokens: 200000,
            max_output_tokens: 64000,
          },
        },
        billing: { tokenPrices: { longContext: { maxPromptTokens: 936000 } } },
      },
      { id: "gpt-6.1-sol", name: "Duplicate" },
      { id: "org-model", supportedContextTiers: ["default", "long_context"] },
      { name: "Missing id" },
    ],
  });
  try {
    expect(await backend.invoke("harness_copilot_models")).toEqual([
      {
        id: "gpt-6.1-sol",
        name: "GPT-6.1 Sol",
        contextWindow: 200000,
        longContextWindow: 1000000,
        supportsLongContext: true,
      },
      { id: "org-model", name: "org-model", supportsLongContext: true },
    ]);
  } finally {
    await backend.close();
  }
});

it("reports CLI catalog errors instead of advertising unavailable remote models", async () => {
  const backend = fixture(
    { code: -32603, message: "Authentication required" },
    true,
  );
  try {
    await expect(backend.invoke("harness_copilot_models")).rejects.toThrow(
      "Authentication required",
    );
  } finally {
    await backend.close();
  }
});
