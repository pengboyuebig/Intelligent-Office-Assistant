import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Upload, FileText, Loader2, Globe, Lock } from "lucide-react";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { useSettingsStore } from "@/stores/settingsStore";
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
  const currentUser = useSettingsStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBases();
  }, []);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createBase(newName.trim(), newDesc.trim(), isPublic);
    setNewName("");
    setNewDesc("");
    setIsPublic(false);
  };

  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedKbId) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (files.length > 10) {
      setUploadError("一次最多上传 10 个文件");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadError("");
    setUploadProgress({ current: 0, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        const isDocx = file.name.toLowerCase().endsWith(".docx");
        const isPdf = file.name.toLowerCase().endsWith(".pdf");

        let content: string;
        let contentType: string | undefined;

        if (isDocx || isPdf) {
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const result = ev.target?.result as ArrayBuffer;
              const bytes = new Uint8Array(result);
              let binary = "";
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              resolve(btoa(binary));
            };
            reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
            reader.readAsArrayBuffer(file);
          });
          contentType = isDocx
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf";
        } else {
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string);
            reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
            reader.readAsText(file);
          });
        }

        await uploadDocument(selectedKbId, file.name, content, contentType);
      }
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "上传失败";
      setUploadError(msg);
      console.error("上传文档失败:", e);
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
          {isAdmin ? (
            <>
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
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded border-border"
                />
                <Globe size={12} /> 公开知识库（所有用户可见）
              </label>
              <button
                onClick={handleCreate}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm
                           hover:opacity-90 flex items-center justify-center gap-1.5 font-medium transition-opacity"
              >
                <Plus size={14} /> 创建知识库
              </button>
            </>
          ) : (
            <div className="text-xs text-muted-foreground px-1 py-1">
              普通用户只读，请联系管理员上传文档。
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {bases.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 px-3">
              <FileText size={28} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs">暂无知识库</p>
              {isAdmin && <p className="text-xs mt-1 opacity-70">在上方输入名称创建</p>}
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
                {kb.is_public && (
                  <span title="公开" className="text-muted-foreground">
                    <Globe size={12} />
                  </span>
                )}
                {!kb.is_public && kb.owner_id !== currentUser?.id && (
                  <span title={`所有者: ${kb.owner_id}`} className="text-muted-foreground">
                    <Lock size={12} />
                  </span>
                )}
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
                  isAdmin && (
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
                  )
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
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.json,.csv,.log,.docx,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading || !!uploadProgress}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary
                                 text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {uploadProgress ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          上传 {uploadProgress.current}/{uploadProgress.total}
                        </>
                      ) : loading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Upload size={15} />
                      )}
                      {uploadProgress ? "" : "上传文档"}
                    </button>
                  </>
                )}
              </div>
            </div>
            {uploadError && (
              <div className="px-5 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs">
                上传失败：{uploadError}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5 bg-muted/10">
              {documents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">暂无文档</p>
                    {isAdmin ? (
                      <>
                        <p className="text-xs mt-1.5 opacity-70">点击右上方"上传文档"添加，最多 10 个</p>
                        <p className="text-xs mt-1 opacity-50">支持 txt、md、json、csv、log、docx、pdf 格式</p>
                      </>
                    ) : (
                      <p className="text-xs mt-1.5 opacity-70">请联系管理员上传文档</p>
                    )}
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
                        isAdmin && (
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
                        )
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
