import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  ensureChatStreamListeners,
  stopChatTask,
} from "./chat/streamEvents";
import type { Conversation, Message } from "./chat/types";
import { getChatSettings } from "./chat/utils";

interface ChatState {
  conversations: Conversation[];
  currentId: string | null;
  messages: Message[];
  streaming: boolean;
  currentTaskId: string | null;
  error: string | null;
  loadConversations: () => Promise<void>;
  createConversation: (title: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  updateConversationKbId: (kbId: string) => Promise<void>;
  sendMessage: (
    content: string,
    skillSystemPrompt?: string,
    knowledgeContext?: string,
  ) => Promise<void>;
  stopStreaming: () => Promise<void>;
  setError: (msg: string) => void;
  clearError: () => void;
}

function getStreamingPlaceholder(conversationId: string): Message {
  return {
    id: "streaming",
    conversation_id: conversationId,
    role: "assistant",
    content: "",
    created_at: "",
  };
}

function buildApiMessages(
  messages: Message[],
  content: string,
  skillSystemPrompt?: string,
  knowledgeContext?: string,
) {
  const apiMessages: { role: string; content: string }[] = [];

  if (skillSystemPrompt) {
    apiMessages.push({ role: "system", content: skillSystemPrompt });
  }
  if (knowledgeContext) {
    apiMessages.push({ role: "system", content: `参考以下知识：\n${knowledgeContext}` });
  }

  for (const message of messages) {
    apiMessages.push({ role: message.role, content: message.content });
  }

  apiMessages.push({ role: "user", content });
  return apiMessages;
}

async function initializeStreamListeners() {
  await ensureChatStreamListeners({
    getTaskId: () => useChatStore.getState().currentTaskId,
    getCurrentConversationId: () => useChatStore.getState().currentId,
    appendChunk: (_taskId, text) => {
      useChatStore.setState((state) => {
        const messages = [...state.messages];
        const streamIndex = messages.findIndex((message) => message.id === "streaming");
        if (streamIndex >= 0) {
          messages[streamIndex] = {
            ...messages[streamIndex],
            content: messages[streamIndex].content + text,
          };
          return { messages };
        }

        if (!state.currentId) {
          return state;
        }

        messages.push({
          ...getStreamingPlaceholder(state.currentId),
          content: text,
        });
        return { messages };
      });
    },
    finishStream: (_taskId, messageFactory) => {
      useChatStore.setState((state) => {
        if (!state.streaming) {
          return state;
        }

        const messages = [...state.messages];
        const streamIndex = messages.findIndex((message) => message.id === "streaming");
        if (streamIndex >= 0) {
          const completedMessage = messageFactory();
          completedMessage.content = messages[streamIndex].content || "(空回复)";
          messages[streamIndex] = completedMessage;
        }

        return {
          messages,
          streaming: false,
          currentTaskId: null,
        };
      });
    },
    failStream: (_taskId, error) => {
      useChatStore.setState((state) => ({
        messages: state.messages.filter((message) => message.id !== "streaming"),
        streaming: false,
        currentTaskId: null,
        error: `发送失败: ${error}`,
      }));
    },
  });
}

export { type Conversation, type Message } from "./chat/types";

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentId: null,
  messages: [],
  streaming: false,
  currentTaskId: null,
  error: null,

  loadConversations: async () => {
    const conversations = await invoke<Conversation[]>("get_conversations");
    set({ conversations });
  },

  createConversation: async (title: string) => {
    const conversation = await invoke<Conversation>("create_conversation", {
      title,
      skillId: null,
      knowledgeBaseIds: [],
    });
    await get().loadConversations();
    set({ currentId: conversation.id, messages: [] });
    return conversation.id;
  },

  deleteConversation: async (id: string) => {
    await invoke("delete_conversation", { id });
    const nextCurrentId = get().currentId === id ? null : get().currentId;
    set({
      currentId: nextCurrentId,
      messages: nextCurrentId ? get().messages : [],
    });
    await get().loadConversations();
  },

  selectConversation: async (id: string) => {
    const messages = await invoke<Message[]>("get_messages", {
      conversationId: id,
    });
    set({ currentId: id, messages });
  },

  updateConversationKbId: async (kbId: string) => {
    const currentId = get().currentId;
    if (!currentId) {
      return;
    }

    await invoke("update_conversation_knowledge_bases", {
      id: currentId,
      knowledgeBaseIds: kbId ? [kbId] : [],
    });
    await get().loadConversations();
  },

  setError: (msg: string) => set({ error: msg }),
  clearError: () => set({ error: null }),

  stopStreaming: async () => {
    const taskId = get().currentTaskId;
    if (taskId) {
      await stopChatTask(taskId);
    }

    set((state) => ({
      streaming: false,
      currentTaskId: null,
      messages: state.messages.filter((message) => message.id !== "streaming"),
    }));
  },

  sendMessage: async (content: string, skillSystemPrompt?: string, knowledgeContext?: string) => {
    const { currentId, messages } = get();
    if (!currentId) {
      return;
    }

    await initializeStreamListeners();

    const settings = getChatSettings();
    const historyMessages = messages.filter((message) => message.id !== "streaming");
    const userMessage = await invoke<Message>("add_message", {
      conversationId: currentId,
      role: "user",
      content,
    });

    set({
      messages: [...historyMessages, userMessage, getStreamingPlaceholder(currentId)],
      streaming: true,
      currentTaskId: null,
      error: null,
    });

    await get().loadConversations();

    try {
      const taskId = await invoke<string>("chat_stream_proxy", {
        apiBase: settings.apiBaseUrl.replace(/\/+$/, ""),
        model: settings.chatModel,
        messages: buildApiMessages(historyMessages, content, skillSystemPrompt, knowledgeContext),
        apiKey: settings.apiKey || undefined,
      });

      set({ currentTaskId: taskId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        messages: state.messages.filter((item) => item.id !== "streaming"),
        streaming: false,
        currentTaskId: null,
        error: `发送失败: ${message}`,
      }));
    }
  },
}));
