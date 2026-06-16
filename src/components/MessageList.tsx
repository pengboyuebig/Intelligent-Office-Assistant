import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import { useChatStore, Message } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group/code my-3">
      {language && (
        <span className="absolute top-2.5 left-3 text-[10px] text-muted-foreground/70 uppercase font-medium">
          {language}
        </span>
      )}
      <button
        onClick={handleCopy}
        className={cn(
          "absolute top-2 right-2 p-1.5 rounded-md text-xs",
          "opacity-0 group-hover/code:opacity-100 transition-opacity",
          "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      </button>
      <pre className="bg-muted/80 p-4 pt-8 rounded-lg overflow-x-auto text-sm">
        <code className={cn(language && `language-${language}`)}>{code}</code>
      </pre>
    </div>
  );
}

function MessageBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const timeStr = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className={cn("flex mb-4 group", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex flex-col max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
          ) : (
            <div className="markdown-body text-sm leading-relaxed">
              {msg.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre({ children }) {
                      return <>{children}</>;
                    },
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeStr = String(children).replace(/\n$/, "");
                      if (match) {
                        return <CodeBlock language={match[1]} code={codeStr} />;
                      }
                      return (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                          {children}
                        </code>
                      );
                    },
                    a({ href, children }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-4 hover:opacity-80"
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : null}
              {isStreaming && !msg.content && (
                <span className="thinking-dots">
                  思考中
                  <span className="dot1">.</span>
                  <span className="dot2">.</span>
                  <span className="dot3">.</span>
                </span>
              )}
            </div>
          )}
        </div>
        {/* 操作栏 */}
        <div
          className={cn(
            "flex items-center gap-1.5 mt-1.5 px-1",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
          <button
            onClick={handleCopy}
            className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="复制"
          >
            {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const currentId = useChatStore((s) => s.currentId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-transparent to-muted/20">
        <div className="text-center text-muted-foreground max-w-sm px-8">
          <div className="text-5xl mb-5 opacity-30">🏛️</div>
          <h2 className="text-lg font-semibold mb-2 text-foreground/80">
            {currentId ? "开始新的对话" : "Intelligent Office Assistant"}
          </h2>
          <p className="text-sm mb-8 text-muted-foreground/80">
            {currentId
              ? "所有数据仅在本地处理，保障您的信息安全"
              : "选择左侧对话，开始智能办公"}
          </p>
          {currentId && (
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  useChatStore.getState().sendMessage("请帮我起草一份关于推进数字化转型工作的实施方案");
                }}
                className="text-sm px-5 py-3 rounded-xl border border-border hover:bg-accent hover:border-primary/30 transition-all text-left bg-card/50"
              >
                📝 起草工作方案
              </button>
              <button
                onClick={() => {
                  useChatStore.getState().sendMessage("请对以下报告进行数据分析，提取关键指标和趋势");
                }}
                className="text-sm px-5 py-3 rounded-xl border border-border hover:bg-accent hover:border-primary/30 transition-all text-left bg-card/50"
              >
                📊 数据分析与报告
              </button>
              <button
                onClick={() => {
                  useChatStore.getState().sendMessage("请帮我审核这份合同/文件的合规性，列出需要注意的条款");
                }}
                className="text-sm px-5 py-3 rounded-xl border border-border hover:bg-accent hover:border-primary/30 transition-all text-left bg-card/50"
              >
                🔍 合规性审查
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const isAssistant = msg.role === "assistant";
          const isStreamingMsg = isLast && isAssistant && streaming;
          return <MessageBubble key={msg.id || i} msg={msg} isStreaming={isStreamingMsg} />;
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
