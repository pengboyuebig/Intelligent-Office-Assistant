import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle, Database, Server, ArrowRight, UserCircle, Users, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";

const DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"];

function SettingsSection({
  icon, title, desc, children, defaultOpen = true,
}: {
  icon: React.ReactNode; title: string; desc: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <ArrowRight size={16} className={cn("text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <label className="text-sm font-medium">{label}</label>
        {desc && <span className="text-xs text-muted-foreground shrink-0">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

function TestResult({ state }: { state: { status: string; msg: string } }) {
  if (state.status === "idle") return null;
  return (
    <div className={cn(
      "flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg",
      state.status === "success" && "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
      state.status === "error" && "bg-red-50 dark:bg-red-900/20 text-destructive",
      state.status === "loading" && "bg-muted text-muted-foreground"
    )}>
      {state.status === "success" && <CheckCircle size={16} />}
      {state.status === "error" && <XCircle size={16} />}
      {state.status === "loading" && <Loader2 size={16} className="animate-spin" />}
      <span className="text-sm">{state.msg}</span>
    </div>
  );
}

function TestButton({ label, onClick, loading, disabled }: {
  label: string; onClick: () => void; loading: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-50 flex items-center gap-2">
      {loading && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  );
}

export default function SettingsView() {
  // 直接从 settingsStore 读取，作为唯一数据源
  const store = useSettingsStore();

  const [saved, setSaved] = useState(false);
  const [testLLM, setTestLLM] = useState<{ status: string; msg: string }>({ status: "idle", msg: "" });
  const [testChroma, setTestChroma] = useState<{ status: string; msg: string }>({ status: "idle", msg: "" });
  const [testRemoteDb, setTestRemoteDb] = useState<{ status: string; msg: string }>({ status: "idle", msg: "" });

  // 登录/切换用户弹窗
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // 新建用户弹窗（仅 admin）
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const isAdmin = store.currentUser?.role === "admin";
  const isDeepSeek = store.llmProvider === "deepseek";

  // 加载设置（只在挂载时执行一次）
  useEffect(() => {
    store.loadSettings();
    store.loadCurrentUser();
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      await store.login(loginUsername, loginPassword);
      setLoginUsername("");
      setLoginPassword("");
      setShowLoginDialog(false);
    } catch (e: any) {
      setLoginError(typeof e === "string" ? e : e?.message || "登录失败");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCreateUser = async () => {
    setCreateLoading(true);
    setCreateError("");
    setCreateSuccess("");
    try {
      await store.createUser(newUserId, newUsername, newPassword, newRole);
      setCreateSuccess(`用户 ${newUsername} 创建成功`);
      setNewUserId("");
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setTimeout(() => setCreateSuccess(""), 2000);
    } catch (e: any) {
      setCreateError(typeof e === "string" ? e : e?.message || "创建用户失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    await store.updateSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestLLM = async () => {
    setTestLLM({ status: "loading", msg: "" });
    const url = isDeepSeek ? store.deepseekBaseUrl : store.apiBaseUrl;
    const key = isDeepSeek ? store.deepseekApiKey : "";
    try {
      const msg = await invoke<string>("test_connection", { apiBase: url, apiKey: key || null });
      setTestLLM({ status: "success", msg });
    } catch (e: any) {
      setTestLLM({ status: "error", msg: typeof e === "string" ? e : e?.message || "连接失败" });
    }
  };

  const handleTestChroma = async () => {
    setTestChroma({ status: "loading", msg: "" });
    try {
      const msg = await invoke<string>("test_chroma_connection");
      setTestChroma({ status: "success", msg });
    } catch (e: any) {
      setTestChroma({ status: "error", msg: typeof e === "string" ? e : e?.message || "连接失败" });
    }
  };

  const handleTestRemoteDb = async () => {
    setTestRemoteDb({ status: "loading", msg: "" });
    try {
      const msg = await invoke<string>("test_remote_db_connection");
      setTestRemoteDb({ status: "success", msg });
    } catch (e: any) {
      setTestRemoteDb({ status: "error", msg: typeof e === "string" ? e : e?.message || "连接失败" });
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-8 py-5">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold tracking-tight">系统设置</h1>
          <p className="text-sm text-muted-foreground mt-1">配置 LLM 服务、向量数据库和远程连接</p>
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-2 animate-fade-in">
              <CheckCircle size={12} /> 设置已保存
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-6 space-y-4">

        {/* ===== 当前用户 ===== */}
        <SettingsSection icon={<UserCircle size={18} />} title="当前用户" desc="查看当前账号权限，切换登录用户">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Users size={18} />
              </div>
              <div>
                <p className="text-sm font-medium">{store.currentUser?.username || "未登录"}</p>
                <p className="text-xs text-muted-foreground">
                  角色: {isAdmin ? "管理员" : "普通用户"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent flex items-center gap-1.5"
                >
                  <UserPlus size={13} /> 新建用户
                </button>
              )}
              <button
                onClick={() => setShowLoginDialog(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
              >
                <LogIn size={13} /> 切换用户
              </button>
            </div>
          </div>
        </SettingsSection>

        {/* ===== 登录弹窗 ===== */}
        {showLoginDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-card border border-border shadow-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">切换用户</h3>
                <button onClick={() => setShowLoginDialog(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">用户名</label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="admin / ptyh"
                    className="input w-full text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">密码</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••"
                      className="input w-full text-sm pr-9"
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                {loginError && (
                  <p className="text-xs text-destructive">{loginError}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowLoginDialog(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent"
                >
                  取消
                </button>
                <button
                  onClick={handleLogin}
                  disabled={loginLoading || !loginUsername || !loginPassword}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {loginLoading && <Loader2 size={12} className="animate-spin" />}
                  登录
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== 新建用户弹窗（仅 admin） ===== */}
        {showCreateDialog && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-card border border-border shadow-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">新建用户</h3>
                <button onClick={() => setShowCreateDialog(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">用户 ID</label>
                  <input
                    type="text"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="唯一标识，如 zhangsan"
                    className="input w-full text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">用户名</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="登录账号"
                    className="input w-full text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••"
                    className="input w-full text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">角色</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="input w-full text-sm"
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                {createError && <p className="text-xs text-destructive">{createError}</p>}
                {createSuccess && <p className="text-xs text-green-600">{createSuccess}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={createLoading || !newUserId || !newUsername || !newPassword}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {createLoading && <Loader2 size={12} className="animate-spin" />}
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== LLM 服务 ===== */}
        <SettingsSection icon={<Server size={18} />} title="LLM 服务" desc="选择推理服务提供方">
          <SettingRow label="服务类型">
            <div className="flex gap-3">
              <button onClick={() => updateSetting("llm_provider", "ollama")}
                className={cn("flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                  !isDeepSeek ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                🦙 Ollama（本地）
              </button>
              <button onClick={() => updateSetting("llm_provider", "deepseek")}
                className={cn("flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                  isDeepSeek ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50")}>
                🔮 DeepSeek（云端）
              </button>
            </div>
          </SettingRow>

          {isDeepSeek ? (
            <>
              <SettingRow label="API 地址">
                <input type="text" value={store.deepseekBaseUrl}
                  onChange={e => updateSetting("deepseek_base_url", e.target.value)}
                  placeholder="https://api.deepseek.com/v1" className="input font-mono text-xs" />
              </SettingRow>
              <SettingRow label="API Key">
                <input type="password" value={store.deepseekApiKey}
                  onChange={e => updateSetting("deepseek_api_key", e.target.value)}
                  placeholder="sk-..." className="input font-mono text-xs" />
              </SettingRow>
              <SettingRow label="聊天模型">
                <select value={store.deepseekModel}
                  onChange={e => updateSetting("deepseek_model", e.target.value)} className="input">
                  {DEEPSEEK_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="custom">自定义...</option>
                </select>
              </SettingRow>
              {store.deepseekModel === "custom" && (
                <SettingRow label="自定义模型名称">
                  <input type="text" value={store.chatModel}
                    onChange={e => updateSetting("chat_model", e.target.value)}
                    placeholder="deepseek-v4-pro" className="input" />
                </SettingRow>
              )}
              <SettingRow label="Embedding 模型" desc="建议搭配 Ollama">
                <input type="text" value={store.embeddingModel}
                  onChange={e => updateSetting("embedding_model", e.target.value)}
                  placeholder="nomic-embed-text" className="input" />
              </SettingRow>
            </>
          ) : (
            <>
              <SettingRow label="API 地址">
                <input type="text" value={store.apiBaseUrl}
                  onChange={e => updateSetting("api_base_url", e.target.value)}
                  placeholder="http://10.1.42.164:11434/v1" className="input font-mono text-xs" />
              </SettingRow>
              <div className="grid grid-cols-2 gap-4">
                <SettingRow label="聊天模型">
                  <input type="text" value={store.chatModel}
                    onChange={e => updateSetting("chat_model", e.target.value)}
                    placeholder="qwen3-vl:4b" className="input" />
                </SettingRow>
                <SettingRow label="Embedding 模型">
                  <input type="text" value={store.embeddingModel}
                    onChange={e => updateSetting("embedding_model", e.target.value)}
                    placeholder="nomic-embed-text" className="input" />
                </SettingRow>
              </div>
            </>
          )}

          <SettingRow label="检索数量 (Top-K)">
            <input type="number" value={store.topK} min={1} max={20}
              onChange={e => updateSetting("top_k", String(Math.max(1, Math.min(20, parseInt(e.target.value) || 5))))}
              className="input w-28" />
          </SettingRow>

          <TestButton label="测试 LLM 连接" onClick={handleTestLLM} loading={testLLM.status === "loading"}
            disabled={!((!isDeepSeek && store.apiBaseUrl) || (isDeepSeek && store.deepseekBaseUrl))} />
          <TestResult state={testLLM} />
        </SettingsSection>

        {/* ===== Chroma 向量库 ===== */}
        <SettingsSection icon={<Database size={18} />} title="Chroma 向量数据库" desc="局域网向量索引服务">
          <SettingRow label="启用 Chroma">
            <select value={String(store.chromaEnabled)}
              onChange={e => updateSetting("chroma_enabled", e.target.value)} className="input">
              <option value="false">关闭</option>
              <option value="true">启用</option>
            </select>
          </SettingRow>
          <SettingRow label="Chroma 地址">
            <input type="text" value={store.chromaEndpoint}
              onChange={e => updateSetting("chroma_endpoint", e.target.value)}
              placeholder="http://localhost:8000" className="input font-mono text-xs" />
          </SettingRow>
          <SettingRow label="集合名称">
            <input type="text" value={store.chromaCollection}
              onChange={e => updateSetting("chroma_collection", e.target.value)}
              placeholder="knowledge_chunks" className="input" />
          </SettingRow>
          <TestButton label="测试 Chroma 连接" onClick={handleTestChroma} loading={testChroma.status === "loading"} disabled={!store.chromaEnabled} />
          <TestResult state={testChroma} />
        </SettingsSection>

        {/* ===== 内网数据库 ===== */}
        <SettingsSection icon={<Database size={18} />} title="内网 PostgreSQL 数据库" desc="共享知识库、文档和技能模板">
          <SettingRow label="启用远程数据库">
            <select value={String(store.remoteDbEnabled)}
              onChange={e => updateSetting("remote_db_enabled", e.target.value)} className="input">
              <option value="false">关闭</option>
              <option value="true">启用</option>
            </select>
          </SettingRow>
          <SettingRow label="数据库连接字符串">
            <input type="text" value={store.remoteDbUrl}
              onChange={e => updateSetting("remote_db_url", e.target.value)}
              placeholder="postgres://user:pass@host:5432/db" className="input font-mono text-xs" />
          </SettingRow>
          <TestButton label="测试数据库连接" onClick={handleTestRemoteDb} loading={testRemoteDb.status === "loading"} disabled={!store.remoteDbEnabled || !store.remoteDbUrl} />
          <TestResult state={testRemoteDb} />
        </SettingsSection>

        {/* ===== 数据存储说明 ===== */}
        <div className="rounded-xl bg-muted/40 border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold">🔒 数据存储说明</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• <strong className="text-foreground">本地 SQLite</strong>：对话记录（仅本机）</p>
            <p>• <strong className="text-foreground">内网 PostgreSQL</strong>：知识库、文档、技能（机构共享）</p>
            <p>• <strong className="text-foreground">内网 Chroma</strong>：向量索引（语义搜索）</p>
            <p>• <strong className="text-foreground">Ollama / DeepSeek</strong>：LLM 推理</p>
          </div>
        </div>
      </div>
    </div>
  );
}
