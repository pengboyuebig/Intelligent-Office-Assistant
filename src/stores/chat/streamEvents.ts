import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Message } from "./types";
import { uid } from "./utils";

interface StreamChunkPayload {
  task_id: string;
  content: string;
  reasoning: string;
}

interface StreamResultPayload {
  task_id: string;
}

interface StreamErrorPayload {
  task_id: string;
  error: string;
}

interface ChatStreamBindings {
  getTaskId: () => string | null;
  getCurrentConversationId: () => string | null;
  appendChunk: (taskId: string, text: string) => void;
  finishStream: (taskId: string, messageFactory: () => Message) => void;
  failStream: (taskId: string, error: string) => void;
}

let unlistenChunk: UnlistenFn | null = null;
let unlistenDone: UnlistenFn | null = null;
let unlistenError: UnlistenFn | null = null;

export async function ensureChatStreamListeners(bindings: ChatStreamBindings) {
  if (unlistenChunk && unlistenDone && unlistenError) {
    return;
  }

  await cleanupChatStreamListeners();

  unlistenChunk = await listen<StreamChunkPayload>("chat-stream-chunk", (event) => {
    const activeTaskId = bindings.getTaskId();
    if (!activeTaskId || event.payload.task_id !== activeTaskId) {
      return;
    }

    const text = event.payload.content || event.payload.reasoning;
    if (!text) {
      return;
    }

    bindings.appendChunk(event.payload.task_id, text);
  });

  unlistenDone = await listen<StreamResultPayload>("chat-stream-done", (event) => {
    const activeTaskId = bindings.getTaskId();
    if (!activeTaskId || event.payload.task_id !== activeTaskId) {
      return;
    }

    bindings.finishStream(event.payload.task_id, () => ({
      id: uid(),
      conversation_id: bindings.getCurrentConversationId() || "",
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    }));
  });

  unlistenError = await listen<StreamErrorPayload>("chat-stream-error", (event) => {
    const activeTaskId = bindings.getTaskId();
    if (!activeTaskId || event.payload.task_id !== activeTaskId) {
      return;
    }

    bindings.failStream(event.payload.task_id, event.payload.error);
  });
}

export async function stopChatTask(taskId: string) {
  await invoke("cancel_chat_stream", { taskId });
}

async function cleanupChatStreamListeners() {
  if (unlistenChunk) {
    unlistenChunk();
    unlistenChunk = null;
  }
  if (unlistenDone) {
    unlistenDone();
    unlistenDone = null;
  }
  if (unlistenError) {
    unlistenError();
    unlistenError = null;
  }
}
