import { useEffect, useState } from "react";
import {
  Plus, Trash2, Puzzle, Save, X, Play,
  FolderPlus, Folder, ChevronRight, ChevronDown,
} from "lucide-react";
import { useSkillStore, Skill } from "@/stores/skillStore";
import { cn } from "@/lib/utils";

const emptySkill = {
  name: "",
  description: "",
  group: "",
  system_prompt: "你是一个有用的助手。",
  tools_md: "",
};

export default function SkillEditor() {
  const {
    skills, groups,
    loadSkills, loadGroups,
    createSkill, updateSkill, deleteSkill,
    createGroup, deleteGroup,
    setEditingSkill,
  } = useSkillStore();

  const [form, setForm] = useState(emptySkill);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", description: "" });
  const [editingGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
    loadGroups();
  }, []);

  const resetForm = () => {
    setForm(emptySkill);
    setEditingId(null);
    setEditingSkill(null);
    setTestResult("");
  };

  const handleNewInGroup = (groupId: string) => {
    resetForm();
    setForm({ ...emptySkill, group: groupId });
  };

  const handleEdit = (skill: Skill) => {
    setForm({
      name: skill.name,
      description: skill.description,
      group: skill.group,
      system_prompt: skill.system_prompt,
      tools_md: skill.tools_md,
    });
    setEditingId(skill.id);
    setEditingSkill(skill);
    setTestResult("");
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    if (editingId) {
      updateSkill(editingId, form.name.trim(), form.description.trim(), form.group, form.system_prompt, form.tools_md);
    } else {
      createSkill(form.name.trim(), form.description.trim(), form.group, form.system_prompt, form.tools_md);
    }
    resetForm();
  };

  const handleDeleteSkill = (id: string) => {
    deleteSkill(id);
    if (editingId === id) resetForm();
    setConfirmTarget(null);
  };

  const handleDeleteGroup = (id: string) => {
    deleteGroup(id);
    setConfirmTarget(null);
  };

  const handleCreateGroup = () => {
    if (!groupForm.name.trim()) return;
    createGroup(groupForm.name.trim(), groupForm.description.trim());
    setGroupForm({ name: "", description: "" });
    setShowNewGroup(false);
  };

  const handleTest = async () => {
    setTestLoading(true);
    setTestResult("");
    try {
      const apiUrl = "http://10.1.42.164:11434/v1";
      const res = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "",
          messages: [
            { role: "system", content: form.system_prompt },
            { role: "user", content: "你好，请简单介绍一下你自己。" },
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: 512,
        }),
      });
      const data = await res.json();
      setTestResult(data.choices?.[0]?.message?.content || "未获取到回复");
    } catch (e: any) {
      setTestResult(`测试失败: ${e.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  const toggleGroup = (id: string) => {
    const next = new Set(expandedGroups);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedGroups(next);
  };

  console.log(editingGroupId);

  const getGroupName = (groupId: string) =>
    groups.find((g) => g.id === groupId)?.name || "默认";

  return (
    <div className="h-full flex">
      {/* 左侧：分组 + 技能列表 */}
      <div className="w-64 border-r border-border bg-muted/30 flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-1.5">
          <button
            onClick={resetForm}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm
                       hover:opacity-90 flex items-center justify-center gap-1.5 font-medium transition-opacity"
          >
            <Plus size={14} /> 新建技能
          </button>
          <button
            onClick={() => setShowNewGroup(!showNewGroup)}
            className="w-full py-2 rounded-lg border border-border text-sm
                       hover:bg-accent flex items-center justify-center gap-1.5 transition-colors"
          >
            <FolderPlus size={14} /> 新建分组
          </button>

          {showNewGroup && (
            <div className="p-3 rounded-lg border border-border bg-background space-y-2 animate-fade-in">
              <input
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                placeholder="分组名称"
                autoFocus
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary transition-colors"
              />
              <input
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                placeholder="描述（可选）"
                className="w-full text-xs px-2.5 py-2 rounded-lg border border-border bg-background outline-none focus:border-primary transition-colors"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreateGroup}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 font-medium transition-opacity"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowNewGroup(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 分组+技能树 */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* 未分组 */}
          {skills.filter((s) => !s.group || !groups.find((g) => g.id === s.group)).length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground font-medium">
                <Folder size={12} /> 未分组
              </div>
              {skills.filter((s) => !s.group || !groups.find((g) => g.id === s.group)).map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => handleEdit(skill)}
                  className={cn(
                    "group flex items-center gap-2 pl-6 pr-2 py-1.5 rounded-lg cursor-pointer mb-0.5 relative transition-colors",
                    editingId === skill.id ? "bg-primary/10 text-primary" : "hover:bg-accent/70",
                  )}
                >
                  <Puzzle size={13} className="shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{skill.name}</p>
                  </div>
                  {confirmTarget === skill.id && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-popover border border-border rounded-lg px-2 py-1 shadow-lg z-10 animate-fade-in">
                      <span className="text-xs text-muted-foreground">确定？</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSkill(skill.id); }} className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90">删除</button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmTarget(null); }} className="text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent">取消</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 分组列表 */}
          {groups.map((group) => {
            const groupSkills = skills.filter((s) => s.group === group.id);
            const isExpanded = expandedGroups.has(group.id) || expandedGroups.size === 0;
            const isDefault = group.id.startsWith("__");

            return (
              <div key={group.id} className="mb-1">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs group/grp transition-colors",
                    "hover:bg-accent/70",
                  )}
                >
                  <button onClick={() => toggleGroup(group.id)} className="shrink-0">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <Folder size={12} className="shrink-0 text-muted-foreground opacity-60" />
                  <span className="flex-1 font-medium truncate">
                    {group.name}
                    <span className="text-muted-foreground ml-1 opacity-60">({groupSkills.length})</span>
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleNewInGroup(group.id)}
                      className="p-0.5 rounded text-muted-foreground opacity-0 group-hover/grp:opacity-100 hover:text-primary hover:bg-accent transition-all"
                      title="在此分组新建技能"
                    >
                      <Plus size={12} />
                    </button>
                    {!isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmTarget(`group-${group.id}`);
                        }}
                        className="p-0.5 rounded text-red-400 opacity-0 group-hover/grp:opacity-100 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {confirmTarget === `group-${group.id}` && (
                  <div className="flex items-center gap-1 ml-6 mb-1 px-2 py-1.5 bg-popover border border-border rounded-lg shadow-lg z-10 animate-fade-in">
                    <span className="text-xs text-muted-foreground">删除分组？</span>
                    <button onClick={() => handleDeleteGroup(group.id)} className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90">删除</button>
                    <button onClick={() => setConfirmTarget(null)} className="text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent">取消</button>
                  </div>
                )}

                {isExpanded && (
                  <div>
                    {groupSkills.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-10 py-1">点击 + 新建技能</p>
                    ) : (
                      groupSkills.map((skill) => (
                        <div
                          key={skill.id}
                          onClick={() => handleEdit(skill)}
                          className={cn(
                            "group flex items-center gap-2 pl-10 pr-2 py-1.5 rounded-lg cursor-pointer mb-0.5 relative transition-colors",
                            editingId === skill.id ? "bg-primary/10 text-primary" : "hover:bg-accent/70",
                          )}
                        >
                          <Puzzle size={13} className="shrink-0 opacity-60" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{skill.name}</p>
                          </div>
                          {confirmTarget === skill.id && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-popover border border-border rounded-lg px-2 py-1 shadow-lg z-10 animate-fade-in">
                              <span className="text-xs text-muted-foreground">确定？</span>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteSkill(skill.id); }} className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground hover:opacity-90">删除</button>
                              <button onClick={(e) => { e.stopPropagation(); setConfirmTarget(null); }} className="text-xs px-1.5 py-0.5 rounded border border-border hover:bg-accent">取消</button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧：编辑器 */}
      <div className="flex-1 flex flex-col bg-background">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-card/50">
          <h2 className="font-semibold text-base">
            {editingId ? `编辑: ${form.name || "未命名"}` : "新建技能"}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                         hover:bg-accent text-sm disabled:opacity-50 transition-colors"
            >
              <Play size={14} /> {testLoading ? "测试中..." : "测试"}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary
                         text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Save size={14} /> 保存
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">
            {/* 所属分组 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">所属分组</label>
              <select
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                className="input"
              >
                <option value="">选择分组...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.id.startsWith("__") ? "(系统)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium block">名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="技能名称"
                  className="input"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium block">描述</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="简短描述"
                  className="input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">系统 Prompt</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                rows={8}
                placeholder="输入 System Prompt..."
                className="input resize-y font-mono text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">工具定义 (Markdown)</label>
              <textarea
                value={form.tools_md}
                onChange={(e) => setForm({ ...form, tools_md: e.target.value })}
                rows={10}
                placeholder={`使用 Markdown 格式定义工具，例如：

### 工具名称
- **功能**: 描述工具的功能
- **参数**:
  - \`param1\` (string): 参数说明
  - \`param2\` (number): 参数说明
- **返回值**: 返回值说明
- **示例**: \`tool_name("arg1", 123)\``}
                className="input resize-y font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                Markdown 格式定义工具，加载技能组时会自动合并到上下文
              </p>
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={cn(
                "p-4 rounded-xl border",
                testResult.startsWith("测试失败") ? "border-destructive/50 bg-destructive/5" : "border-border bg-card",
              )}>
                <h3 className="text-sm font-medium mb-2">测试结果</h3>
                <div className="markdown-body text-sm text-muted-foreground whitespace-pre-wrap">
                  {testResult}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
