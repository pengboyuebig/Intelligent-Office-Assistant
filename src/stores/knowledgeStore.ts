import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  is_public: boolean;
  created_at: string;
}

export interface Chunk {
  id: string;
  doc_id: string;
  content: string;
  embedding: number[];
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  filename: string;
  content: string;
  chunk_count: number;
  created_at: string;
}

interface KnowledgeState {
  bases: KnowledgeBase[];
  selectedKbId: string | null;
  documents: Document[];
  loading: boolean;
  chunkCount: number;
  loadBases: () => Promise<void>;
  createBase: (name: string, description: string, isPublic?: boolean) => Promise<void>;
  deleteBase: (id: string) => Promise<void>;
  selectBase: (id: string) => Promise<void>;
  uploadDocument: (kbId: string, filename: string, content: string, contentType?: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  searchKnowledge: (kbId: string, query: string) => Promise<string[]>;
  searchAllKnowledge: (query: string) => Promise<string[]>;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  bases: [],
  selectedKbId: null,
  documents: [],
  loading: false,
  chunkCount: 0,

  loadBases: async () => {
    try {
      const bases = await invoke<KnowledgeBase[]>("get_knowledge_bases");
      set({ bases });
    } catch (e) {
      console.error("加载知识库失败:", e);
    }
  },

  createBase: async (name: string, description: string, isPublic?: boolean) => {
    try {
      await invoke("create_knowledge_base", { name, description, isPublic: isPublic ?? false });
      await get().loadBases();
    } catch (e) {
      console.error("创建知识库失败:", e);
    }
  },

  deleteBase: async (id: string) => {
    try {
      await invoke("delete_knowledge_base", { id });
      if (get().selectedKbId === id) {
        set({ selectedKbId: null, documents: [], chunkCount: 0 });
      }
      await get().loadBases();
    } catch (e) {
      console.error("删除知识库失败:", e);
    }
  },

  selectBase: async (id: string) => {
    try {
      const docs = await invoke<Document[]>("get_documents", {
        knowledgeBaseId: id,
      });
      const chunkCount = docs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
      set({ selectedKbId: id, documents: docs, chunkCount });
    } catch (e) {
      console.error("选择知识库失败:", e);
    }
  },

  uploadDocument: async (kbId: string, filename: string, content: string, contentType?: string) => {
    set({ loading: true });
    try {
      await invoke("upload_document", {
        knowledgeBaseId: kbId,
        filename,
        content,
        contentType: contentType || null,
      });
      // 刷新文档列表
      const docs = await invoke<Document[]>("get_documents", {
        knowledgeBaseId: kbId,
      });
      const chunkCount = docs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
      set({ documents: docs, chunkCount, loading: false });
    } catch (e) {
      console.error("上传文档失败:", e);
      set({ loading: false });
      throw e;
    }
  },

  deleteDocument: async (id: string) => {
    const { selectedKbId } = get();
    if (!selectedKbId) return;
    try {
      await invoke("delete_document", { id });
      const docs = await invoke<Document[]>("get_documents", {
        knowledgeBaseId: selectedKbId,
      });
      const chunkCount = docs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
      set({ documents: docs, chunkCount });
    } catch (e) {
      console.error("删除文档失败:", e);
    }
  },

  searchKnowledge: async (kbId: string, query: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("search_knowledge", {
        knowledgeBaseId: kbId,
        query,
      });
    } catch (e) {
      console.error("知识库检索失败:", e);
      return ["检索失败，请检查 embedding 模型配置"];
    }
  },

  searchAllKnowledge: async (query: string): Promise<string[]> => {
    try {
      return await invoke<string[]>("search_all_knowledge", { query });
    } catch (e) {
      console.error("跨库检索失败:", e);
      return [];
    }
  },
}));
