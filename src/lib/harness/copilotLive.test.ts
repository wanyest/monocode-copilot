import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessEvent } from "./types";

const sent: string[] = [];
let onLine: ((line: string) => void) | undefined;
let spawned: { command: string; args: string[]; cwd: string } | undefined;

vi.mock("./child", () => ({
  resolveCopilotBinary: async () => ({ path: "/fake/copilot" }),
  spawnChild: async (
    _id: string,
    command: string,
    args: string[],
    cwd: string,
  ) => {
    spawned = { command, args, cwd };
  },
  killChild: async () => undefined,
  unwatchChild: () => undefined,
  watchChild: (_id: string, line: (value: string) => void) => {
    onLine = line;
  },
  writeChild: async (_id: string, line: string) => {
    sent.push(line);
  },
}));

const {
  __copilotTestReset,
  respondCopilotApproval,
  sendCopilotTurn,
  stopCopilotSession,
} = await import("./copilot");

function messages() {
  return sent.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function outbound(method: string) {
  return messages().find((message) => message.method === method);
}

function reply(id: number, result: unknown) {
  onLine!(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function notify(method: string, params: unknown) {
  onLine!(JSON.stringify({ jsonrpc: "2.0", method, params }));
}

function request(id: number, method: string, params: unknown) {
  onLine!(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function startTurn(
  modelSettings: Record<string, string> = {},
  setupMethod: "session/new" | "session/load" = "session/new",
) {
  const events: HarnessEvent[] = [];
  const turn = sendCopilotTurn({
    sessionId: "copilot-live",
    cwd: "/repo",
    model: "copilot:gpt-5.4",
    modelSettings,
    runtimeMode: "supervised",
    text: "inspect the project",
    attachments: [],
    onEvent: (event) => events.push(event),
  });

  await waitFor(() => !!outbound("initialize"), "initialize");
  reply(outbound("initialize")!.id as number, { protocolVersion: 1 });
  await waitFor(() => !!outbound(setupMethod), setupMethod);
  reply(outbound(setupMethod)!.id as number, { sessionId: "copilot_1" });
  await waitFor(() => !!outbound("session/set_model"), "session/set_model");
  reply(outbound("session/set_model")!.id as number, {});
  await waitFor(() => !!outbound("session/set_mode"), "session/set_mode");
  reply(outbound("session/set_mode")!.id as number, {});
  await waitFor(
    () => !!outbound("session/set_config_option"),
    "session/set_config_option",
  );
  reply(outbound("session/set_config_option")!.id as number, {});
  await waitFor(() => !!outbound("session/prompt"), "session/prompt");
  return {
    events,
    promptId: outbound("session/prompt")!.id as number,
    turn,
  };
}

beforeEach(() => {
  sent.length = 0;
  onLine = undefined;
  spawned = undefined;
  __copilotTestReset();
});

afterEach(async () => {
  await stopCopilotSession("copilot-live");
  __copilotTestReset();
});

describe("GitHub Copilot ACP adapter", () => {
  it("starts ACP stdio, selects the model, and streams the response", async () => {
    const { events, promptId, turn } = await startTurn();
    expect(spawned).toEqual({
      command: "/fake/copilot",
      args: [
        "--acp",
        "--stdio",
        "--no-auto-update",
        "--context",
        "default",
      ],
      cwd: "/repo",
    });
    expect(outbound("session/set_model")?.params).toEqual({
      sessionId: "copilot_1",
      modelId: "gpt-5.4",
    });

    notify("session/update", {
      sessionId: "copilot_1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Done" },
      },
    });
    reply(promptId, { stopReason: "end_turn" });
    await turn;

    expect(events).toContainEqual({ type: "message.delta", text: "Done" });
    expect(events).toContainEqual({ type: "message.completed" });
  });

  it("restarts and resumes the session when extended context is selected", async () => {
    const first = await startTurn();
    reply(first.promptId, { stopReason: "end_turn" });
    await first.turn;

    sent.length = 0;
    const second = await startTurn(
      { context: "long_context" },
      "session/load",
    );
    expect(spawned).toEqual({
      command: "/fake/copilot",
      args: [
        "--acp",
        "--stdio",
        "--no-auto-update",
        "--context",
        "long_context",
      ],
      cwd: "/repo",
    });
    expect(outbound("session/load")?.params).toEqual({
      sessionId: "copilot_1",
      cwd: "/repo",
      mcpServers: [],
    });

    reply(second.promptId, { stopReason: "end_turn" });
    await second.turn;
  });

  it("surfaces supervised permission requests and returns the decision", async () => {
    const { events, promptId, turn } = await startTurn();
    request(99, "session/request_permission", {
      sessionId: "copilot_1",
      toolCall: {
        toolCallId: "tool_1",
        title: "Run tests",
        kind: "execute",
      },
      options: [
        { optionId: "allow-once", name: "Allow once" },
        { optionId: "reject-once", name: "Reject" },
      ],
    });
    await waitFor(
      () => events.some((event) => event.type === "approval.requested"),
      "approval request",
    );
    respondCopilotApproval("copilot-live", 99, "allow");
    await waitFor(
      () => messages().some((message) => message.id === 99 && "result" in message),
      "permission response",
    );

    const response = messages().find((message) => message.id === 99);
    expect(response?.result).toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    });
    reply(promptId, { stopReason: "end_turn" });
    await turn;
  });
});
