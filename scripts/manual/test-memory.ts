#!/usr/bin/env bun

/**
 * Manual integration smoke test for the memory layer.
 * This script is intentionally verbose for human inspection.
 */
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import {
  initializeDatabase,
  closeDatabase,
  storeMemory,
  queryMemoryByTopic,
  deleteMemoriesByTopic,
  getAllTopics,
  getMemoryStats,
  clearScratchpad,
  storeScratchpad,
  getScratchpad,
} from "../../src/core/memory";

console.log("🧪 Testing Venus Memory System\n");

// Clean up old database for testing
try {
  const dbPath = join(import.meta.dir, "../../src/db/venus.db");
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    console.log("✓ Cleared old database");
  }
} catch (e) {
  // Database may not exist yet
}

// Test 1: Initialize database
console.log("\n1️⃣  Testing Database Initialization...");
try {
  initializeDatabase();
  console.log("✓ Database initialized successfully");
} catch (error) {
  console.error("✗ Failed to initialize database:", error);
  process.exit(1);
}

// Test 2: Store memory
console.log("\n2️⃣  Testing Memory Storage (/memorize)...");
try {
  const mem1 = await storeMemory("project", "Building a CLI assistant for terminal");
  const mem2 = await storeMemory("project", "Using Bun as the runtime");
  const mem3 = await storeMemory("preferences", "Prefer lightning-fast tools");

  console.log(`✓ Stored 3 memories`);
  console.log(`  - ID: ${mem1.id.slice(0, 8)}... (project)`);
  console.log(`  - ID: ${mem2.id.slice(0, 8)}... (project)`);
  console.log(`  - ID: ${mem3.id.slice(0, 8)}... (preferences)`);
} catch (error) {
  console.error("✗ Failed to store memory:", error);
  process.exit(1);
}

// Test 3: Query memory
console.log("\n3️⃣  Testing Memory Retrieval (/recall)...");
try {
  const memories = queryMemoryByTopic("project", 10);
  console.log(`✓ Retrieved ${memories.length} memories for topic "project"`);
  memories.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.content.slice(0, 50)}...`);
  });
} catch (error) {
  console.error("✗ Failed to retrieve memory:", error);
  process.exit(1);
}

// Test 4: Get all topics
console.log("\n4️⃣  Testing Topic Listing...");
try {
  const topics = getAllTopics();
  console.log(`✓ Found ${topics.length} unique topics:`);
  topics.forEach((t) => {
    console.log(`  - ${t}`);
  });
} catch (error) {
  console.error("✗ Failed to get topics:", error);
  process.exit(1);
}

// Test 5: Get stats
console.log("\n5️⃣  Testing Memory Statistics (/stats)...");
try {
  const stats = getMemoryStats();
  console.log(`✓ Memory Statistics:`);
  console.log(`  - Total Memories: ${stats.totalMemories}`);
  console.log(`  - Total Topics: ${stats.totalTopics}`);
  console.log(`  - Scratchpad Size: ${stats.scratchpadSize}`);
  console.log(`  - Oldest: ${stats.oldestMemory ? new Date(stats.oldestMemory).toLocaleString() : "N/A"}`);
  console.log(`  - Newest: ${stats.newestMemory ? new Date(stats.newestMemory).toLocaleString() : "N/A"}`);
} catch (error) {
  console.error("✗ Failed to get stats:", error);
  process.exit(1);
}

// Test 6: Delete memories
console.log("\n6️⃣  Testing Memory Deletion (/forget)...");
try {
  const deleted = deleteMemoriesByTopic("project");
  console.log(`✓ Deleted ${deleted} memory/memories`);

  const stats = getMemoryStats();
  console.log(`  - Remaining memories: ${stats.totalMemories}`);
} catch (error) {
  console.error("✗ Failed to delete memory:", error);
  process.exit(1);
}

// Test 7: Working memory (scratchpad)
console.log("\n7️⃣  Testing Working Memory (Scratchpad)...");
try {
  clearScratchpad();
  const scratch1 = storeScratchpad("Currently reading Chapter 3 of the book");
  const scratch2 = storeScratchpad("Need to refactor the memory manager");

  console.log(`✓ Stored 2 scratchpad entries`);

  const current = getScratchpad();
  console.log(`  - Current scratchpad: ${current?.content}`);
} catch (error) {
  console.error("✗ Failed with scratchpad:", error);
  process.exit(1);
}

// Test 8: Final stats
console.log("\n8️⃣  Final Statistics...");
try {
  const finalStats = getMemoryStats();
  console.log(`✓ Final Memory State:`);
  console.log(`  - Total Memories: ${finalStats.totalMemories}`);
  console.log(`  - Total Topics: ${finalStats.totalTopics}`);
  console.log(`  - Scratchpad Entries: ${finalStats.scratchpadSize}`);
} catch (error) {
  console.error("✗ Failed to get final stats:", error);
  process.exit(1);
}

// Cleanup
console.log("\n🧹 Cleaning up...");
closeDatabase();

console.log("\n✅ All tests passed!\n");
