/**
 * Memory System Types
 * Defines schemas for long-term and working memory
 */

export interface MemoryRecord {
  id: string;
  topic: string;
  content: string;
  embedding?: number[]; // Optional vector embedding
  embedding_model?: string;
  created_at: number; // Unix timestamp
  updated_at: number;
  source_session_id?: string;
  source_message_id?: string;
  metadata?: string; // JSON metadata
}

export interface ChatHistoryRecord {
  id: string;
  content: string;
  embedding?: number[];
  embedding_model?: string;
  created_at: number;
  source_session_id?: string;
  source_message_id?: string;
  metadata?: string;
}

export interface WorkingMemory {
  id: string;
  content: string;
  created_at: number;
  expires_at?: number; // Optional expiration
}

export interface SessionContext {
  id: string;
  session_id: string;
  key: string;
  value: string;
  created_at: number;
}

export interface MemoryQuery {
  query: string;
  topK?: number;
  threshold?: number; // Relevance threshold for semantic search
}

export interface MemorySearchResult extends MemoryRecord {
  relevance?: number; // Similarity score
}

export interface ChatHistorySearchResult extends ChatHistoryRecord {
  relevance?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model?: string;
  total_tokens: number;
  created_at: number;
  updated_at: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "model" | "assistant" | "system";
  content: string;
  type: "text" | "tool_call" | "tool_result";
  timestamp: number;
  tokens?: number;
  embedding?: number[];
}

export interface MemoryLink {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  strength: number;
  created_at: number;
}

