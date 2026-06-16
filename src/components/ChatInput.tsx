import { useState, useRef, useEffect } from "react";
import { Send, StopCircle, Database, Layers } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { clearDraft, loadDraft, saveDraft } from "@/stores/chat/draftStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { useSkillStore } from "@/stores/skillStore";
import { cn } from "@/lib/utils";

export default function ChatInput() {
  const [input, setInput] = useState("");
  const streaming = useChatStore((s) => s.streaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const currentId = useChatStore((s) => s.currentId);
  const conversations = useChatStore((s) => s.conversations);
  const updateConversationKbId = useChatStore((s) => s.updateConversationKbId);
  const [retrieving, setRetrieving] = useState(false);

  const bases = useKnowledgeStore((s) => s.bases);
  const groups = useSkillStore((s) => s.groups);
  const skills = useSkillStore((s) => s.skills);

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedKbId, setSelectedKbId] = useState<string>("");

  useEffect(() => {
    useKnowledgeStore.getState().loadBases();
    useSkillStore.getState().loadSkills();
    useSkillStore.getState().loadGroups();
  }, []);

  // 切换对话时恢复知识库选择
  useEffect(() => {
    if (!currentId) {
      setSelectedKbId("");
      return;
    }
    const conv = conversations.find((c) => c.id === currentId);
    if (conv && conv.knowledge_base_ids) {
      try {
        const ids: string[] = JSON.parse(conv.knowledge_base_ids);
        setSelectedKbId(ids[0] || "");
      } catch {
        setSelectedKbId("");
      }
    } else {
      setSelectedKbId("");
    }
  }, [currentId]);

  useEffect(() => {
    if (currentId) {
      setInput(loadDraft(currentId));
    } else {
      setInput("");
    }
  }, [currentId]);

  useEffect(() => {
    if (currentId) {
      saveDraft(currentId, input);
    }
  }, [input, currentId]);

  const handleSend = async () => {
    if (!input.trim() || streaming || !currentId) return;

    setRetrieving(true);
    let knowledgeContext = "";
    let skillSystemPrompt = "";

    try {
      let chunks: string[] = [];
      if (selectedKbId) {
        // 选择了特定知识库，只搜索该知识库
        chunks = await useKnowledgeStore.getState().searchKnowledge(selectedKbId, input.trim());
      } else if (bases.length > 0) {
        // 未选择知识库则搜索全部
        chunks = await useKnowledgeStore.getState().searchAllKnowledge(input.trim());
      }
      if (chunks.length > 0) {
        knowledgeContext = chunks.join("\n---\n");
      }
    } catch (e) {
      console.warn("知识库检索失败:", e);
    }

    if (selectedGroupId) {
      const prompt = useSkillStore.getState().getGroupSystemPrompt(selectedGroupId);
      if (prompt) {
        skillSystemPrompt = prompt;
      }
    }

    setRetrieving(false);
    void sendMessage(input.trim(), skillSystemPrompt, knowledgeContext);
    setInput("");
    if (currentId) {
      clearDraft(currentId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    void stopStreaming();
  };

  const handleKbChange = (kbId: string) => {
    setSelectedKbId(kbId);
    void updateConversationKbId(kbId);
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const groupSkillCount = selectedGroup
    ? skills.filter((s) => s.group === selectedGroup.id).length
    : 0;

  const selectedKb = bases.find((b) => b.id === selectedKbId);

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto space-y-2.5">
        {/* 工具栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 知识库选择器 */}
          <select
            value={selectedKbId}
            onChange={(e) => handleKbChange(e.target.value)}
            className="text-xs px-2.5 py-1 rounded-lg border border-border bg-background outline-none focus:border-primary transition-colors cursor-pointer min-w-0 max-w-[180px]"
          >
            <option value="">📚 {bases.length > 0 ? `全部知识库 (${bases.length})` : "暂无知识库"}</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                📄 {b.name}
              </option>
            ))}
          </select>

          {selectedKb && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium">
              <Database size={12} />
              {selectedKb.name}
            </span>
          )}

          {/* 技能分组选择器 */}
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="text-xs px-2.5 py-1 rounded-lg border border-border bg-background outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="">📋 不选择工作流</option>
            {groups.map((g) => {
              const count = skills.filter((s) => s.group === g.id).length;
              return (
                <option key={g.id} value={g.id}>
                  📋 {g.name} ({count}个)
                </option>
              );
            })}
          </select>

          {/* 选中分组提示 */}
          {selectedGroupId && groupSkillCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Layers size={12} />
              已加载 {groupSkillCount} 个工作流
            </span>
          )}

          {retrieving && (
            <span className="text-xs text-muted-foreground animate-pulse">
              正在检索知识库...
            </span>
          )}
        </div>

        {/* 输入框 */}
        <div className="flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentId ? "输入消息，Enter 发送，Shift+Enter 换行..." : "请先新建或选择一个对话"}
              disabled={!currentId}
              rows={1}
              className={cn(
                "w-full min-h-[52px] max-h-[200px] resize-y rounded-xl border bg-background px-4 py-3 pr-10",
                "text-sm outline-none transition-colors placeholder:text-muted-foreground/60",
                "disabled:opacity-50",
                streaming ? "border-primary/50 shadow-sm" : "border-border",
              )}
            />
          </div>
          <button
            onClick={streaming ? handleStop : handleSend}
            disabled={!streaming && (!input.trim() || !currentId)}
            className={cn(
              "p-3 rounded-xl shrink-0 transition-all shadow-sm",
              streaming
                ? "bg-destructive text-destructive-foreground hover:opacity-90"
                : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40",
            )}
          >
            {streaming ? <StopCircle size={18} /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
