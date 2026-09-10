import { promptBlocks } from "../attachments";
import { nativeModelId } from "../models";
import type { RuntimeMode } from "../session";
import { AcpClient, type AcpHandlers } from "./acp";
import {
  killChild,
  resolveCopilotBinary,
  spawnChild,
  unwatchChild,
  watchChild,
} from "./child";
import {
  eventsFromAcpUpdate,
  permissionOptionId,
  permissionRequestFromAcp,
  sessionIdFromResult,
} from "./fxProtocol";
import type {
  ApprovalDecision,
  HarnessEvent,
  SendTurnInput,
  SteerTurnInput,
} from "./types";

type SessionSetupResult = {
  sessionId?: string;
  session_id?: string;
  configOptions?: unknown;
};

type Live = {
  acp: AcpClient;
  acpSessionId: string;
  cwd: string;
  contextTier: CopilotContextTier;
  muteUpdates: boolean;
  cancelled: boolean;
  runtimeMode: RuntimeMode;
  planning: boolean;
  onEvent: (event: HarnessEvent) => void;
  approvals: Map<number, (decision: ApprovalDecision) => void>;
  turns: Promise<void>;
};

type Resume = {
  acpSessionId: string;
  cwd: string;
};

type CopilotContextTier = "default" | "long_context";

const CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

const INIT_TIMEOUT_MS = 15_000;
const SESSION_TIMEOUT_MS = 45_000;
const CONTROL_TIMEOUT_MS = 15_000;
const PROMPT_TIMEOUT_MS = 30 * 60_000;

const AGENT_MODE = "https://agentclientprotocol.com/protocol/session-modes#agent";
const PLAN_MODE = "https://agentclientprotocol.com/protocol/session-modes#plan";

const liveByThread = new Map<string, Live>();
const resumeByThread = new Map<string, Resume>();
const cancelledThreads = new Set<string>();

export async function sendCopilotTurn(input: SendTurnInput): Promise<void> {
  let live: Live;
  try {
    live = await ensureLive(input);
  } catch (error) {
    cancelledThreads.delete(input.sessionId);
    throw copilotStartupError(error);
  }
  if (cancelledThreads.delete(input.sessionId)) return;

  live.onEvent = input.onEvent;
  live.runtimeMode = input.runtimeMode;
  live.planning = input.intent === "plan";
  live.turns = live.turns
    .catch(() => undefined)
    .then(async () => {
      live.cancelled = false;
      live.muteUpdates = false;
      try {
        await applyModelSelection(live, input.model);
        if (live.cancelled) return;
        await applyRuntimeMode(live, input.runtimeMode, live.planning);
        if (live.cancelled) return;
        await prompt(live, input);
      } catch (error) {
        if (live.cancelled) return;
        throw error;
      }
    });

  try {
    await live.turns;
  } catch (error) {
    if (liveByThread.get(input.sessionId) === live) {
      await stopCopilotSession(input.sessionId);
    }
    throw error;
  }
}

export async function steerCopilotTurn(input: SteerTurnInput): Promise<void> {
  const live = liveByThread.get(input.sessionId);
  if (!live) throw new Error("No active GitHub Copilot session");
  const blocks = promptBlocks(input.text, input.attachments);
  if (blocks.length === 0) return;
  const params = { sessionId: live.acpSessionId, prompt: blocks };
  try {
    await live.acp.notify("session/steer", params);
  } catch {
    await live.acp.notify("_session/steer", params);
  }
}

export function respondCopilotApproval(
  sessionId: string,
  requestId: number,
  decision: ApprovalDecision,
): void {
  liveByThread.get(sessionId)?.approvals.get(requestId)?.(decision);
}

export async function cancelCopilotTurn(sessionId: string): Promise<void> {
  const live = liveByThread.get(sessionId);
  if (!live) {
    cancelledThreads.add(sessionId);
    return;
  }
  live.cancelled = true;
  live.muteUpdates = true;
  for (const resolve of live.approvals.values()) resolve("deny");
  live.approvals.clear();
  await live.acp
    .notify("session/cancel", { sessionId: live.acpSessionId })
    .catch(() => undefined);
  live.acp.rejectPending(new Error("cancelled"));
}

export async function stopCopilotSession(sessionId: string): Promise<void> {
  cancelledThreads.delete(sessionId);
  const live = liveByThread.get(sessionId);
  liveByThread.delete(sessionId);
  if (live) {
    live.muteUpdates = true;
    for (const resolve of live.approvals.values()) resolve("deny");
    live.approvals.clear();
    live.acp.close();
  }
  unwatchChild(sessionId);
  await killChild(sessionId).catch(() => undefined);
}

export async function forgetCopilotSession(sessionId: string): Promise<void> {
  resumeByThread.delete(sessionId);
  await stopCopilotSession(sessionId);
}

export function bindCopilotSession(
  threadId: string,
  acpSessionId: string,
  cwd: string,
): void {
  const sessionId = acpSessionId.trim();
  if (!threadId || !sessionId || !cwd.trim()) return;
  resumeByThread.set(threadId, { acpSessionId: sessionId, cwd });
}

async function ensureLive(input: SendTurnInput): Promise<Live> {
  const contextTier = copilotContextTier(input.modelSettings);
  const existing = liveByThread.get(input.sessionId);
  if (
    existing &&
    existing.cwd === input.cwd &&
    existing.contextTier === contextTier
  ) {
    existing.onEvent = input.onEvent;
    existing.runtimeMode = input.runtimeMode;
    existing.planning = input.intent === "plan";
    return existing;
  }
  if (existing) {
    if (existing.cwd !== input.cwd) resumeByThread.delete(input.sessionId);
    await stopCopilotSession(input.sessionId);
  }

  const resume = resumeByThread.get(input.sessionId);
  const canLoad = resume != null && resume.cwd === input.cwd;
  if (resume && resume.cwd !== input.cwd) {
    resumeByThread.delete(input.sessionId);
  }

  const { path } = await resolveCopilotBinary();
  const handlers: AcpHandlers = {};
  const acp = new AcpClient(input.sessionId, handlers);
  const liveRef: { current: Live | null } = { current: null };
  const muteGate = { current: false };

  handlers.onNotification = (method, params) => {
    if (muteGate.current) return;
    const live = liveRef.current;
    if (!live || live.muteUpdates) return;
    if (method !== "session/update") return;
    for (const event of eventsFromAcpUpdate(params)) live.onEvent(event);
  };
  handlers.onRequest = (id, method, params) => {
    const live = liveRef.current;
    if (!live) {
      void acp.respondError(id, {
        code: -32601,
        message: `Method not found: ${method}`,
      });
      return;
    }
    void handleRequest(live, id, method, params);
  };

  const emit = (event: HarnessEvent) => {
    (liveRef.current?.onEvent ?? input.onEvent)(event);
  };

  watchChild(
    input.sessionId,
    (line) => acp.pushLine(line),
    (code) => {
      acp.close(new Error("GitHub Copilot CLI exited"));
      liveByThread.delete(input.sessionId);
      emit({ type: "session.ended", code });
    },
    (line) => {
      console.debug("[monocode] copilot stderr", line);
    },
  );

  await spawnChild(
    input.sessionId,
    path,
    ["--acp", "--stdio", "--no-auto-update", "--context", contextTier],
    input.cwd,
  );

  try {
    await acp.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: CLIENT_CAPABILITIES,
        clientInfo: { name: "monocode", version: "0.1.0" },
      },
      INIT_TIMEOUT_MS,
    );

    let setup: SessionSetupResult | undefined;
    let acpSessionId: string | undefined;
    let didLoad = false;

    if (canLoad && resume) {
      muteGate.current = true;
      try {
        setup = await acp.request<SessionSetupResult>(
          "session/load",
          {
            sessionId: resume.acpSessionId,
            cwd: input.cwd,
            mcpServers: [],
          },
          SESSION_TIMEOUT_MS,
        );
        acpSessionId = sessionIdFromResult(setup) ?? resume.acpSessionId;
        didLoad = true;
      } catch {
        setup = undefined;
        acpSessionId = undefined;
      } finally {
        muteGate.current = false;
      }
    }

    if (!acpSessionId) {
      setup = await acp.request<SessionSetupResult>(
        "session/new",
        { cwd: input.cwd, mcpServers: [] },
        SESSION_TIMEOUT_MS,
      );
      acpSessionId = sessionIdFromResult(setup);
    }
    if (!acpSessionId) {
      throw new Error("GitHub Copilot did not return a session id");
    }

    const live: Live = {
      acp,
      acpSessionId,
      cwd: input.cwd,
      contextTier,
      muteUpdates: didLoad,
      cancelled: false,
      runtimeMode: input.runtimeMode,
      planning: input.intent === "plan",
      onEvent: input.onEvent,
      approvals: new Map(),
      turns: Promise.resolve(),
    };
    liveRef.current = live;
    liveByThread.set(input.sessionId, live);
    resumeByThread.set(input.sessionId, { acpSessionId, cwd: input.cwd });
    live.onEvent({
      type: "session.providerBound",
      providerSessionId: acpSessionId,
    });
    live.onEvent({ type: "session.started" });
    return live;
  } catch (error) {
    acp.close(error instanceof Error ? error : new Error(String(error)));
    await stopCopilotSession(input.sessionId);
    throw error;
  }
}

function copilotContextTier(
  settings: Record<string, string> | undefined,
): CopilotContextTier {
  return settings?.context === "long_context" ? "long_context" : "default";
}

async function applyModelSelection(live: Live, model: string): Promise<void> {
  const modelId = nativeModelId(model).trim();
  if (!modelId) return;
  await live.acp.request(
    "session/set_model",
    { sessionId: live.acpSessionId, modelId },
    CONTROL_TIMEOUT_MS,
  );
}

async function applyRuntimeMode(
  live: Live,
  runtimeMode: RuntimeMode,
  planning: boolean,
): Promise<void> {
  await live.acp
    .request(
      "session/set_mode",
      {
        sessionId: live.acpSessionId,
        modeId: planning ? PLAN_MODE : AGENT_MODE,
      },
      CONTROL_TIMEOUT_MS,
    )
    .catch((error: unknown) => {
      console.debug("[monocode] copilot session/set_mode", error);
    });

  await live.acp
    .request(
      "session/set_config_option",
      {
        sessionId: live.acpSessionId,
        configId: "allow_all",
        value: !planning && runtimeMode === "full-access" ? "on" : "off",
      },
      CONTROL_TIMEOUT_MS,
    )
    .catch((error: unknown) => {
      console.debug("[monocode] copilot allow_all", error);
    });
}

async function prompt(live: Live, input: SendTurnInput): Promise<void> {
  const blocks = promptBlocks(input.text, input.attachments);
  if (blocks.length === 0) return;
  try {
    await live.acp.request(
      "session/prompt",
      { sessionId: live.acpSessionId, prompt: blocks },
      PROMPT_TIMEOUT_MS,
    );
    if (live.cancelled) return;
    live.onEvent({ type: "message.completed" });
    live.onEvent({ type: "reasoning.completed" });
  } catch (error) {
    if (live.cancelled) return;
    live.onEvent({
      type: "session.error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleRequest(
  live: Live,
  id: number,
  method: string,
  params: unknown,
): Promise<void> {
  if (method === "session/request_permission") {
    await handlePermission(live, id, params);
    return;
  }
  await live.acp
    .respondError(id, { code: -32601, message: `Method not found: ${method}` })
    .catch(() => undefined);
}

async function handlePermission(
  live: Live,
  id: number,
  params: unknown,
): Promise<void> {
  const request = permissionRequestFromAcp(params);
  if (request.callId) {
    live.onEvent({
      type: "tool.updated",
      callId: request.callId,
      title: request.title,
      kind: request.kind,
      preview: request.preview,
    });
  }

  const automatic = automaticDecision(live, request.kind, request.preview?.kind);
  if (automatic) {
    await live.acp.respond(id, {
      outcome: {
        outcome: "selected",
        optionId: permissionOptionId(automatic, request.optionIds),
      },
    });
    return;
  }

  live.onEvent({
    type: "approval.requested",
    requestId: id,
    title: request.title,
    kind: request.kind,
    callId: request.callId,
    preview: request.preview,
  });
  const decision = await new Promise<ApprovalDecision>((resolve) => {
    live.approvals.set(id, resolve);
  });
  live.approvals.delete(id);
  live.onEvent({ type: "approval.resolved", requestId: id, decision });
  await live.acp.respond(id, {
    outcome: {
      outcome: "selected",
      optionId: permissionOptionId(decision, request.optionIds),
    },
  });
}

function automaticDecision(
  live: Live,
  reportedKind: string | undefined,
  previewKind: string | undefined,
): ApprovalDecision | null {
  const kind = (previewKind ?? reportedKind ?? "").toLowerCase();
  if (live.planning) {
    return kind === "read" || kind === "search" ? "allow" : "deny";
  }
  if (live.runtimeMode === "supervised") return null;
  if (live.runtimeMode === "auto-accept-edits") {
    return kind === "write" || kind === "edit" ? "allow" : null;
  }
  return "allow";
}

function copilotStartupError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  if (/authentication required|not authenticated|login/i.test(detail)) {
    return new Error(`${detail.trim()}\n\nRun \`copilot login\` in a terminal, then retry.`);
  }
  return error instanceof Error ? error : new Error(detail);
}

/** Test seam. */
export function __copilotTestReset(): void {
  liveByThread.clear();
  resumeByThread.clear();
  cancelledThreads.clear();
}
