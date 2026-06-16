import { useEffect, useState } from "react";
import { Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useSkillStore } from "@/stores/skillStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { cn } from "@/lib/utils";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";

export default function ChatView() {
  const {
    conversations,
    currentId,
    loadConversations,
    createConversation,
    deleteConversation,
    selectConversation,
    streaming,
  } = useChatStore();
  const skills = useSkillStore((s) => s.skills);
  const bases = useKnowledgeStore((s) => s.bases);
  const [showSidebar, setShowSidebar] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  useEffect(() => {
    void loadConversations();
    useSkillStore.getState().loadSkills();
    useKnowledgeStore.getState().loadBases();
  }, []);

  const handleCreate = async () => {
    const title = newTitle.trim() || `新对话 ${conversations.length + 1}`;
    await createConversation(title);
    setNewTitle("");
  };

  const handleDelete = (id: string) => {
    setConfirmTarget(id);
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void deleteConversation(id);
    setConfirmTarget(null);
  };

  return (
    <div className="h-full flex">
      {/* 对话列表侧栏 */}
      <div
        className={cn(
          "border-r border-border bg-muted/30 flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
          showSidebar ? "w-64" : "w-0",
        )}
      >
        <div className="px-3 py-2.5 border-b border-border space-y-2">
          <div className="flex gap-1.5">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="新对话名称..."
              className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background
                         outline-none focus:border-primary transition-colors"
            />
            <button
              onClick={handleCreate}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 shrink-0 transition-opacity"
            >
              <Plus size={15} />
            </button>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="收起列表"
          >
            <PanelLeftClose size={13} /> 收起
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 px-3">
              <MessageSquare size={28} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs">暂无对话</p>
              <p className="text-xs mt-1 opacity-70">输入名称创建新对话</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => void selectConversation(conv.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-0.5 relative transition-colors",
                  currentId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-accent/70 text-foreground",
                )}
              >
                <MessageSquare size={14} className="shrink-0 opacity-60" />
                <span className="flex-1 text-sm truncate">{conv.title}</span>
                {confirmTarget === conv.id ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-popover border border-border rounded-lg px-2 py-1 shadow-lg z-10 animate-fade-in">
                    <span className="text-xs text-muted-foreground">确定？</span>
                    <button
                      onClick={(e) => confirmDelete(conv.id, e)}
                      className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90"
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmTarget(null);
                      }}
                      className="text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(conv.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground
                               hover:text-red-500 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 对话区域 */}
      <div className="flex-1 flex flex-col relative">
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute top-3 left-3 z-10 p-2 rounded-lg bg-card border border-border
                       text-muted-foreground hover:text-foreground hover:bg-accent shadow-sm
                       animate-fade-in"
            title="展开侧栏"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          <MessageList />
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
