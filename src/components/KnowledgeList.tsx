import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Upload, FileText, Loader2 } from "lucide-react";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { cn } from "@/lib/utils";

export default function KnowledgeList() {
  const {
    bases,
    documents,
    selectedKbId,
    loading,
    loadBases,
    createBase,
    deleteBase,
    selectBase,
    uploadDocument,
    deleteDocument,
  } = useKnowledgeStore();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBases();
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createBase(newName.trim(), newDesc.trim());
    setNewName("");
    setNewDesc("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedKbId) return;

    const isDocx = file.name.toLowerCase().endsWith(".docx");
    const isPdf = file.name.toLowerCase().endsWith(".pdf");

    if (isDocx || isPdf) {
      // docx/pdf：读为 ArrayBuffer 后转 base64
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(result);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const contentType = isDocx
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf";
        uploadDocument(selectedKbId, file.name, base64, contentType);
      };
      reader.readAsArrayBuffer(file);
    } else {
      // 纯文本
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        uploadDocument(selectedKbId, file.name, text);
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmTarget?.startsWith("kb-") && confirmTarget === `kb-${id}`) {
      deleteBase(id);
    } else if (confirmTarget?.startsWith("doc-") && confirmTarget === `doc-${id}`) {
      deleteDocument(id);
    }
    setConfirmTarget(null);
  };

  return (
    <div className="h-full flex">
      {/* 知识库列表 */}
      <div className="w-64 border-r border-border bg-muted/30 flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="知识库名称..."
            className="w-full text-sm px-2.5 py-2 rounded-lg border border-border bg-background
                       outline-none focus:border-primary transition-colors"
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="描述（可选）..."
            className="w-full text-sm px-2.5 py-2 rounded-lg border border-border bg-background
                       outline-none focus:border-primary transition-colors"
          />
          <button
            onClick={handleCreate}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm
                       hover:opacity-90 flex items-center justify-center gap-1.5 font-medium transition-opacity"
          >
            <Plus size={14} /> 创建知识库
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {bases.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 px-3">
              <FileText size={28} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs">暂无知识库</p>
              <p className="text-xs mt-1 opacity-70">在上方输入名称创建</p>
            </div>
          ) : (
            bases.map((kb) => (
              <div
                key={kb.id}
                onClick={() => selectBase(kb.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-0.5 relative transition-colors",
                  selectedKbId === kb.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-accent/70 text-foreground",
                )}
              >
                <FileText size={14} className="shrink-0 opacity-60" />
                <span className="flex-1 text-sm truncate">{kb.name}</span>
                {confirmTarget === `kb-${kb.id}` ? (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-popover border border-border rounded-lg px-2 py-1 shadow-lg z-10 animate-fade-in">
                    <span className="text-xs text-muted-foreground">确定？</span>
                    <button
                      onClick={(e) => confirmDelete(kb.id, e)}
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
                      setConfirmTarget(`kb-${kb.id}`);
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

      {/* 文档列表 */}
      <div className="flex-1 flex flex-col">
        {selectedKbId ? (
          <>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/50">
              <div>
                <h2 className="font-semibold text-base">
                  {bases.find((b) => b.id === selectedKbId)?.name}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {documents.length} 个文档
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.csv,.log,.docx,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary
                             text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Upload size={15} />
                  )}
                  上传文档
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-muted/10">
              {documents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">暂无文档</p>
                    <p className="text-xs mt-1.5 opacity-70">
                      点击右上方"上传文档"添加
                    </p>
                    <p className="text-xs mt-1 opacity-50">
                      支持 txt、md、json、csv、log、docx、pdf 格式
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border
                                 border-border hover:border-primary/30 transition-colors relative group"
                    >
                      <div className="p-2 rounded-lg bg-muted/50">
                        <FileText size={18} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.chunk_count > 0
                            ? `${doc.chunk_count} 个分块已索引`
                            : "未索引"}
                        </p>
                      </div>
                      {confirmTarget === `doc-${doc.id}` ? (
                        <div className="flex items-center gap-1 bg-popover border border-border rounded-lg px-2 py-1 shadow-lg z-10 animate-fade-in">
                          <span className="text-xs text-muted-foreground">确定？</span>
                          <button
                            onClick={(e) => confirmDelete(doc.id, e)}
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
                            setConfirmTarget(`doc-${doc.id}`);
                          }}
                          className="p-2 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100
                                     hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-transparent to-muted/20">
            <div className="text-center text-muted-foreground px-8">
              <FileText size={56} className="mx-auto mb-4 opacity-20" />
              <p className="text-base font-medium text-foreground/70">选择一个知识库</p>
              <p className="text-sm mt-1.5 opacity-70">开始管理您的文档和知识库</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
