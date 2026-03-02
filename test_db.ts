import { initializeDatabase, getDatabase, createChatSession, addChatMessage, getChatMessages, getChatSessions } from './src/core/memory';

// Initialize
await initializeDatabase();

console.log("=== BEFORE ===");
const db = getDatabase();
console.log("Sessions:", db.query("SELECT count(*) as c FROM chat_sessions").get());
console.log("Messages:", db.query("SELECT count(*) as c FROM chat_messages").get());

// Create a test session
const session = createChatSession("Test Session", "gemma-3-27b-it");
console.log("\nCreated session:", session.id);

// Add a test message
try {
    const msg = addChatMessage({
        session_id: session.id,
        role: "user",
        content: "Hello test!",
        type: "text",
    });
    console.log("Added message:", msg.id, "timestamp:", msg.timestamp);
} catch (err) {
    console.error("FAILED to add message:", err);
}

// Add another test message
try {
    const msg2 = addChatMessage({
        session_id: session.id,
        role: "model",
        content: "Hello back!",
        type: "text",
    });
    console.log("Added message:", msg2.id);
} catch (err) {
    console.error("FAILED to add message:", err);
}

console.log("\n=== AFTER ===");
console.log("Sessions:", db.query("SELECT count(*) as c FROM chat_sessions").get());
console.log("Messages:", db.query("SELECT count(*) as c FROM chat_messages").get());
console.log("Messages for session:", getChatMessages(session.id).length);
console.log("Sample:", getChatMessages(session.id).map(m => ({ role: m.role, content: m.content.slice(0, 50), ts: m.timestamp })));
