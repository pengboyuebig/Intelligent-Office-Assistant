export interface Conversation {
  id: string;
  title: string;
  skill_id: string | null;
  knowledge_base_ids: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}
