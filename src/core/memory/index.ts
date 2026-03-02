/**
 * Memory Module Exports
 */

export {
  initializeDatabase,
  getDatabase,
  closeDatabase,
} from "./database";

export {
  storeMemory,
  queryMemoryByTopic,
  getMemoryById,
  updateMemory,
  deleteMemory,
  deleteMemoriesByTopic,
  getAllTopics,
  queryMemoryByVector,
  storeScratchpad,
  getScratchpad,
  clearScratchpad,
  pruneExpiredScratchpad,
  storeSessionContext,
  getSessionContextValue,
  getSessionContext,
  clearSessionContext,
  getMemoryStats,
  createChatSession,
  getChatSessions,
  getChatMessages,
  addChatMessage,
  updateChatSession,
  deleteChatSession,
  linkMemories,
  getLinkedMemories,
  unlinkMemories,
  modifyMemory,
  getAllMemoryLinks,
  indexChatMessageForRAG,
  queryChatHistoryByVector,
} from "./manager";

export type { MemoryRecord, WorkingMemory, SessionContext, ChatSession, ChatMessage, MemoryLink } from "../../types/memory";
