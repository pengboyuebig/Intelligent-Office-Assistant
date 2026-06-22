import { useSettingsStore } from "../settingsStore";

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function getChatSettings() {
  const settings = useSettingsStore.getState();
  const isDeepSeek = settings.llmProvider === "deepseek";
  const deepseekModel =
    settings.deepseekModel === "custom"
      ? settings.chatModel || "deepseek-chat"
      : settings.deepseekModel || "deepseek-chat";

  return {
    provider: isDeepSeek ? "deepseek" : "ollama",
    requiresKey: isDeepSeek,
    apiBaseUrl: isDeepSeek
      ? settings.deepseekBaseUrl || "https://api.deepseek.com/v1"
      : settings.apiBaseUrl || "http://10.1.42.164:11434/v1",
    apiKey: isDeepSeek ? settings.deepseekApiKey || "" : "",
    chatModel: isDeepSeek ? deepseekModel : settings.chatModel || "",
  };
}
