import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

const SETTINGS_KEY = "swift_settings";
const SENSITIVE_FIELDS = new Set(["deepseekApiKey", "remoteDbUrl"]);

interface UserInfo {
  id: string;
  username: string;
  role: "admin" | "user";
}

interface SettingsState {
  llmProvider: string;
  apiBaseUrl: string;
  deepseekBaseUrl: string;
  deepseekApiKey: string;
  deepseekModel: string;
  chatModel: string;
  embeddingModel: string;
  topK: number;
  chromaEndpoint: string;
  chromaEnabled: boolean;
  chromaCollection: string;
  remoteDbUrl: string;
  remoteDbEnabled: boolean;
  currentUser: UserInfo | null;
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  createUser: (id: string, username: string, password: string, role: string) => Promise<void>;
  loadCurrentUser: () => Promise<void>;
}

function sanitizeForStorage(state: SettingsState) {
  return {
    llmProvider: state.llmProvider,
    apiBaseUrl: state.apiBaseUrl,
    deepseekBaseUrl: state.deepseekBaseUrl,
    deepseekModel: state.deepseekModel,
    chatModel: state.chatModel,
    embeddingModel: state.embeddingModel,
    topK: state.topK,
    chromaEndpoint: state.chromaEndpoint,
    chromaEnabled: state.chromaEnabled,
    chromaCollection: state.chromaCollection,
    remoteDbEnabled: state.remoteDbEnabled,
    currentUser: state.currentUser,
  };
}

function loadInitialSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return null;
    }

    const settings = JSON.parse(raw);
    return {
      llmProvider: settings.llmProvider || settings.llm_provider || "ollama",
      apiBaseUrl: settings.apiBaseUrl || settings.api_base_url || "http://localhost:11434/v1",
      deepseekBaseUrl: settings.deepseekBaseUrl || settings.deepseek_base_url || "https://api.deepseek.com/v1",
      deepseekApiKey: "",
      deepseekModel: settings.deepseekModel || settings.deepseek_model || "deepseek-chat",
      chatModel: settings.chatModel || settings.chat_model || "qwen3-vl:4b",
      embeddingModel: settings.embeddingModel || settings.embedding_model || "",
      topK: settings.topK ?? parseInt(settings.top_k) ?? 5,
      chromaEndpoint: settings.chromaEndpoint || settings.chroma_endpoint || "http://localhost:8000",
      chromaEnabled: settings.chromaEnabled === true || settings.chroma_enabled === "true",
      chromaCollection: settings.chromaCollection || settings.chroma_collection || "knowledge_chunks",
      remoteDbUrl: "",
      remoteDbEnabled: settings.remoteDbEnabled === true || settings.remote_db_enabled === "true",
        currentUser: settings.currentUser || null,
    };
  } catch {
    return null;
  }
}

const initial = loadInitialSettings();

function saveToStorage(state: SettingsState) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeForStorage(state)));
  } catch {}
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  llmProvider: initial?.llmProvider || "ollama",
  apiBaseUrl: initial?.apiBaseUrl || "http://localhost:11434/v1",
  deepseekBaseUrl: initial?.deepseekBaseUrl || "https://api.deepseek.com/v1",
  deepseekApiKey: "",
  deepseekModel: initial?.deepseekModel || "deepseek-chat",
  chatModel: initial?.chatModel || "qwen3-vl:4b",
  embeddingModel: initial?.embeddingModel || "",
  topK: initial?.topK ?? 5,
  chromaEndpoint: initial?.chromaEndpoint || "http://localhost:8000",
  chromaEnabled: initial?.chromaEnabled || false,
  chromaCollection: initial?.chromaCollection || "knowledge_chunks",
  remoteDbUrl: "",
  remoteDbEnabled: initial?.remoteDbEnabled || false,
  currentUser: initial?.currentUser || null,

  loadSettings: async () => {
    try {
      const backendSettings = await invoke<[string, string][]>("get_all_settings");
      if (!backendSettings || backendSettings.length === 0) {
        return;
      }

      const map = new Map(backendSettings);
      const nextState: Partial<SettingsState> = {};
      if (map.has("llm_provider")) nextState.llmProvider = map.get("llm_provider")!;
      if (map.has("api_base_url")) nextState.apiBaseUrl = map.get("api_base_url")!;
      if (map.has("deepseek_base_url")) nextState.deepseekBaseUrl = map.get("deepseek_base_url")!;
      if (map.has("deepseek_api_key")) nextState.deepseekApiKey = map.get("deepseek_api_key")!;
      if (map.has("deepseek_model")) nextState.deepseekModel = map.get("deepseek_model")!;
      if (map.has("chat_model")) nextState.chatModel = map.get("chat_model")!;
      if (map.has("embedding_model")) nextState.embeddingModel = map.get("embedding_model")!;
      if (map.has("top_k")) nextState.topK = parseInt(map.get("top_k")!) || get().topK;
      if (map.has("chroma_endpoint")) nextState.chromaEndpoint = map.get("chroma_endpoint")!;
      if (map.has("chroma_enabled")) nextState.chromaEnabled = map.get("chroma_enabled") === "true";
      if (map.has("chroma_collection")) nextState.chromaCollection = map.get("chroma_collection")!;
      if (map.has("remote_db_url")) nextState.remoteDbUrl = map.get("remote_db_url")!;
      if (map.has("remote_db_enabled")) nextState.remoteDbEnabled = map.get("remote_db_enabled") === "true";

      set(nextState);
      saveToStorage({ ...get(), ...nextState });
    } catch (error) {
      console.warn("从后端加载设置失败", error);
    }
  },

  loadCurrentUser: async () => {
    try {
      const user = await invoke<UserInfo | null>('get_current_user');
      if (user) {
        set({ currentUser: user });
        saveToStorage({ ...get(), currentUser: user });
      }
    } catch (error) {
      console.warn('加载当前用户失败', error);
    }
  },

  switchUser: async (userId: string) => {
    try {
      await invoke('switch_user', { userId });
      const user = await invoke<UserInfo | null>('get_current_user');
      set({ currentUser: user });
      saveToStorage({ ...get(), currentUser: user });
    } catch (error) {
      console.warn('切换用户失败', error);
      throw error;
    }
  },

  login: async (username: string, password: string) => {
    const user = await invoke<UserInfo | null>('login', { username, password });
    if (!user) {
      throw new Error('用户名或密码错误');
    }
    await invoke('switch_user', { userId: user.id });
    set({ currentUser: user });
    saveToStorage({ ...get(), currentUser: user });
  },

  createUser: async (id: string, username: string, password: string, role: string) => {
    await invoke('create_user', { id, username, password, role });
  },

  updateSetting: async (key: string, value: string) => {
    const current = get();
    const keyMap: Record<string, keyof SettingsState> = {
      llm_provider: "llmProvider",
      api_base_url: "apiBaseUrl",
      deepseek_base_url: "deepseekBaseUrl",
      deepseek_api_key: "deepseekApiKey",
      deepseek_model: "deepseekModel",
      chat_model: "chatModel",
      embedding_model: "embeddingModel",
      top_k: "topK",
      chroma_endpoint: "chromaEndpoint",
      chroma_enabled: "chromaEnabled",
      chroma_collection: "chromaCollection",
      remote_db_url: "remoteDbUrl",
      remote_db_enabled: "remoteDbEnabled",
    };

    const field = keyMap[key] || (key as keyof SettingsState);
    let finalValue: string | number | boolean = value;
    if (field === "topK") finalValue = Math.max(1, Math.min(20, parseInt(value) || 5));
    if (field === "chromaEnabled" || field === "remoteDbEnabled") finalValue = value === "true";

    const nextState = { ...current, [field]: finalValue };
    if (!SENSITIVE_FIELDS.has(String(field))) {
      saveToStorage(nextState);
    }

    try {
      await invoke("set_setting", { key, value: String(finalValue) });
    } catch (error) {
      console.warn("同步设置到后端失败", error);
    }

    set(nextState);
  },
}));
