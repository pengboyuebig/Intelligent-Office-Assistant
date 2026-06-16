import { create } from "zustand";

export interface Skill {
  id: string;
  name: string;
  description: string;
  group: string;           // 所属分组
  system_prompt: string;
  tools_md: string;        // 工具定义，Markdown 格式
  created_at: string;
  updated_at: string;
}

export interface SkillGroup {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

const SKILL_KEY = "swift_skills";
const SKILL_GROUP_KEY = "swift_skill_groups";

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function loadJSON(key: string, fallback: any = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

interface SkillState {
  skills: Skill[];
  groups: SkillGroup[];
  editingSkill: Skill | null;
  loadSkills: () => void;
  // 分组管理
  loadGroups: () => void;
  createGroup: (name: string, description: string) => void;
  updateGroup: (id: string, name: string, description: string) => void;
  deleteGroup: (id: string) => void;
  // 技能管理
  createSkill: (name: string, description: string, group: string, systemPrompt: string, toolsMd: string) => void;
  updateSkill: (id: string, name: string, description: string, group: string, systemPrompt: string, toolsMd: string) => void;
  deleteSkill: (id: string) => void;
  setEditingSkill: (skill: Skill | null) => void;
  // 获取分组下所有技能的合并 system prompt
  getGroupSystemPrompt: (groupId: string) => string;
}

// 默认分组（面向政府、金融、医疗行业）
function ensureDefaults(groups: SkillGroup[]) {
  if (groups.length === 0) {
    const defaults: SkillGroup[] = [
      { id: "__policy_analysis__", name: "政策分析", description: "政策文件解读与分析", created_at: new Date().toISOString() },
      { id: "__document_drafting__", name: "公文起草", description: "公文、方案、报告撰写", created_at: new Date().toISOString() },
      { id: "__data_review__", name: "审查审核", description: "合规审查、数据分析", created_at: new Date().toISOString() },
    ];
    saveJSON(SKILL_GROUP_KEY, defaults);
    return defaults;
  }
  return groups;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  groups: [],
  editingSkill: null,

  loadSkills: () => {
    const skills = loadJSON(SKILL_KEY, []) as Skill[];
    set({ skills });
  },

  // ========== 分组管理 ==========

  loadGroups: () => {
    let groups = loadJSON(SKILL_GROUP_KEY, null) as SkillGroup[] | null;
    groups = ensureDefaults(groups ?? []);
    set({ groups });
  },

  createGroup: (name: string, description: string) => {
    const group: SkillGroup = {
      id: uid(),
      name,
      description,
      created_at: new Date().toISOString(),
    };
    const groups = [...get().groups, group];
    saveJSON(SKILL_GROUP_KEY, groups);
    set({ groups });
  },

  updateGroup: (id: string, name: string, description: string) => {
    const groups = get().groups.map((g) =>
      g.id === id ? { ...g, name, description } : g,
    );
    saveJSON(SKILL_GROUP_KEY, groups);
    set({ groups });
  },

  deleteGroup: (id: string) => {
    // 删除分组时，把该分组下的技能移到默认分组
    const groups = get().groups.filter((g) => g.id !== id);
    saveJSON(SKILL_GROUP_KEY, groups);
    const skills = get().skills.map((s) =>
      s.group === id ? { ...s, group: groups[0]?.id || "__policy_analysis__" } : s,
    );
    saveJSON(SKILL_KEY, skills);
    set({ groups, skills });
  },

  // ========== 技能管理 ==========

  createSkill: (name: string, description: string, group: string, systemPrompt: string, toolsMd: string) => {
    const skill: Skill = {
      id: uid(),
      name,
      description,
      group: group || get().groups[0]?.id || "__policy_analysis__",
      system_prompt: systemPrompt,
      tools_md: toolsMd,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const skills = [skill, ...get().skills];
    saveJSON(SKILL_KEY, skills);
    set({ skills });
  },

  updateSkill: (id: string, name: string, description: string, group: string, systemPrompt: string, toolsMd: string) => {
    const skills = get().skills.map((s) =>
      s.id === id
        ? {
            ...s,
            name,
            description,
            group: group || s.group,
            system_prompt: systemPrompt,
            tools_md: toolsMd,
            updated_at: new Date().toISOString(),
          }
        : s,
    );
    saveJSON(SKILL_KEY, skills);
    set({ skills, editingSkill: null });
  },

  deleteSkill: (id: string) => {
    const skills = get().skills.filter((s) => s.id !== id);
    saveJSON(SKILL_KEY, skills);
    set({ skills });
  },

  setEditingSkill: (skill) => set({ editingSkill: skill }),

  // ========== 获取分组合并提示词 ==========

  getGroupSystemPrompt: (groupId: string) => {
    const { skills } = get();
    const groupSkills = skills.filter((s) => s.group === groupId && s.system_prompt.trim());
    if (groupSkills.length === 0) return "";

    const parts = groupSkills.map((s) => {
      let block = `## ${s.name}\n${s.system_prompt}`;
      if (s.tools_md.trim()) {
        block += `\n\n### 可用工具\n${s.tools_md}`;
      }
      return block;
    });
    return `# 角色定义\n\n你同时扮演以下角色，按照具体情况使用对应角色的能力。每个角色下定义了可用的工具，在需要时使用。\n\n${parts.join("\n\n---\n\n")}`;
  },
}));
