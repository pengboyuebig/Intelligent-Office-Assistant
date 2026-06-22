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

  const maxHistory = 10;
  const recentMessages = messages.length > maxHistory
    ? messages.slice(messages.length - maxHistory)
    : messages;

  if (messages.length > recentMessages.length) {
    apiMessages.push({
      role: "system",
      content: `（此前对话已省略较早的 ${messages.length - recentMessages.length} 条消息）`,
    });
  }

  for (const message of recentMessages) {
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
    finishStream: async (_taskId, messageFactory) => {
      const { currentId, messages: currentMessages } = useChatStore.getState();
      if (!currentId) {
        return;
      }

      const streamIndex = currentMessages.findIndex((message) => message.id === "streaming");
      if (streamIndex < 0) {
        useChatStore.setState({ streaming: false, currentTaskId: null });
        return;
      }

      const completedMessage = messageFactory();
      completedMessage.content = currentMessages[streamIndex].content || "(空回复)";

      try {
        const savedMessage = await invoke<Message>("add_message", {
          conversationId: currentId,
          role: "assistant",
          content: completedMessage.content,
        });
        completedMessage.id = savedMessage.id;
        completedMessage.created_at = savedMessage.created_at;
      } catch (error) {
        console.error("保存 assistant 消息失败:", error);
      }

      useChatStore.setState((state) => {
        const messages = [...state.messages];
        const idx = messages.findIndex((message) => message.id === "streaming");
        if (idx >= 0) {
          messages[idx] = completedMessage;
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
      const apiBase = settings.apiBaseUrl.replace(/\/+$/, "");
      const isLocal =
        apiBase.includes("localhost") ||
        apiBase.includes("127.0.0.1") ||
        apiBase.startsWith("http://10.") ||
        apiBase.startsWith("http://192.168.");

      if (!settings.apiKey && !isLocal) {
        throw new Error(
          "当前目标地址不是本地服务，且未配置 API Key。请在设置中填写 API Key 后再试。",
        );
      }

      const taskId = await invoke<string>("chat_stream_proxy", {
        apiBase,
        model: settings.chatModel,
        messages: buildApiMessages(historyMessages, content, skillSystemPrompt, knowledgeContext),
        apiKey: settings.apiKey || undefined,
      });

      set({ currentTaskId: taskId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      let userMessage = message;
      if (message.includes("401") || message.toLowerCase().includes("authentication") || message.toLowerCase().includes("unauthorized")) {
        userMessage = settings.apiKey
          ? `API 鉴权失败：当前 API Key 无效或已过期。请检查设置中的 API Key。\n原始错误：${message}`
          : `API 鉴权失败：当前未配置 API Key。请在设置中填写 API Key（DeepSeek 需填写 deepseek_api_key；Ollama 若使用远程地址也可能需要 Key）。\n原始错误：${message}`;
      }
      set((state) => ({
        messages: state.messages.filter((item) => item.id !== "streaming"),
        streaming: false,
        currentTaskId: null,
        error: `发送失败: ${userMessage}`,
      }));
    }
  },
}));
