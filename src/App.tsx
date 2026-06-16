import {
  MessageSquare,
  BookOpen,
  Puzzle,
  Settings,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import Titlebar from "./components/Titlebar";
import ChatView from "./components/ChatView";
import KnowledgeList from "./components/KnowledgeList";
import SkillEditor from "./components/SkillEditor";
import SettingsView from "./components/SettingsView";

type NavItem = "chat" | "knowledge" | "skills" | "settings";

const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  { id: "chat", label: "智能问答", icon: <MessageSquare size={18} /> },
  { id: "knowledge", label: "文档中心", icon: <BookOpen size={18} /> },
  { id: "skills", label: "工作流", icon: <Puzzle size={18} /> },
  { id: "settings", label: "系统设置", icon: <Settings size={18} /> },
];

const pageTitleMap: Record<NavItem, string> = {
  chat: "智能问答",
  knowledge: "文档中心",
  skills: "工作流",
  settings: "系统设置",
};

export default function App() {
  const [activeNav, setActiveNav] = useState<NavItem>("chat");
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 4000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <Titlebar />

      {/* ===== 顶部标题栏 ===== */}
      <header className="h-12 shrink-0 border-b border-border bg-gradient-to-r from-card via-card to-muted/30 flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-xs">🏛️</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Intelligent Office Assistant</span>
          <span className="text-xs text-muted-foreground/60 hidden sm:inline">Chroma版</span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground/50">{pageTitleMap[activeNav]}</span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏导航 — 加宽设计 */}
        <nav className="w-20 flex flex-col items-center py-3 gap-1.5 border-r border-border bg-card shrink-0">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "w-16 h-14 flex flex-col items-center justify-center rounded-xl gap-1 transition-all duration-150",
                activeNav === item.id
                  ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent",
              )}
              title={item.label}
            >
              {item.icon}
              <span className="text-[10px] leading-none font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* 主内容区 */}
        <main className="flex-1 overflow-hidden">
          {activeNav === "chat" && <ChatView />}
          {activeNav === "knowledge" && <KnowledgeList />}
          {activeNav === "skills" && <SkillEditor />}
          {activeNav === "settings" && <SettingsView />}
        </main>
      </div>

      {/* 错误 Toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-5 py-3 rounded-lg shadow-lg animate-slide-in-from-bottom text-sm max-w-lg">
          {error}
        </div>
      )}
    </div>
  );
}
