const fs = require('fs');

// Create a large ChatGPT export file (~60MB)
function createLargeChatGPTExport() {
  const baseConversation = {
    "title": "Large Test Conversation",
    "create_time": 1640995200,
    "update_time": 1640995200,
    "mapping": {},
    "moderation_results": [],
    "current_node": "",
    "plugin_ids": null,
    "conversation_id": "test-conv-large",
    "conversation_template_id": null,
    "gizmo_id": null,
    "is_archived": false,
    "safe_urls": []
  };

  const messages = [];
  let nodeId = 1;
  
  // Create 50,000 messages to reach ~60MB
  for (let i = 0; i < 50000; i++) {
    const userNodeId = `node-${nodeId++}`;
    const assistantNodeId = `node-${nodeId++}`;
    
    // User message
    baseConversation.mapping[userNodeId] = {
      id: userNodeId,
      message: {
        id: `msg-user-${i}`,
        author: { role: "user", name: null, metadata: {} },
        content: { content_type: "text", parts: [`This is test user message number ${i}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`] },
        status: "finished_successfully",
        end_turn: true,
        weight: 1.0,
        metadata: { timestamp_: new Date(1640995200000 + i * 60000).toISOString(), model_slug: "gpt-4" },
        recipient: "all",
        create_time: 1640995200 + i * 60,
        update_time: 1640995200 + i * 60
      },
      parent: i === 0 ? null : `node-${nodeId - 4}`,
      children: [assistantNodeId]
    };
    
    // Assistant message
    baseConversation.mapping[assistantNodeId] = {
      id: assistantNodeId,
      message: {
        id: `msg-assistant-${i}`,
        author: { role: "assistant", name: null, metadata: {} },
        content: { content_type: "text", parts: [`This is assistant response number ${i}. I understand your message. Here's a detailed response with multiple paragraphs to increase the file size. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.`] },
        status: "finished_successfully",
        end_turn: true,
        weight: 1.0,
        metadata: { timestamp_: new Date(1640995200000 + i * 60000 + 30000).toISOString(), model_slug: "gpt-4" },
        recipient: "all",
        create_time: 1640995200 + i * 60 + 30,
        update_time: 1640995200 + i * 60 + 30
      },
      parent: userNodeId,
      children: []
    };
  }
  
  baseConversation.current_node = `node-${nodeId - 1}`;
  
  const jsonString = JSON.stringify(baseConversation, null, 2);
  fs.writeFileSync('test-large-chatgpt.json', jsonString);
  console.log(`Created test-large-chatgpt.json (${Math.round(jsonString.length / 1024 / 1024)}MB)`);
}

// Create a Claude export file (JSONL format)
function createClaudeExport() {
  const messages = [];
  
  for (let i = 0; i < 1000; i++) {
    // User message
    messages.push({
      role: "human",
      content: `This is test human message ${i}. What can you tell me about artificial intelligence and machine learning?`,
      timestamp: new Date(1640995200000 + i * 120000).toISOString(),
      id: `claude-user-${i}`,
      conversation_id: "claude-test-conv",
      model: "claude-3-sonnet"
    });
    
    // Assistant message
    messages.push({
      role: "assistant", 
      content: `This is Claude response ${i}. Artificial intelligence and machine learning are fascinating fields that involve creating systems that can learn and make decisions. They encompass various techniques including neural networks, deep learning, and statistical methods.`,
      timestamp: new Date(1640995200000 + i * 120000 + 60000).toISOString(),
      id: `claude-assistant-${i}`,
      conversation_id: "claude-test-conv",
      model: "claude-3-sonnet"
    });
  }
  
  const jsonlContent = messages.map(msg => JSON.stringify(msg)).join('\n');
  fs.writeFileSync('test-claude-export.jsonl', jsonlContent);
  console.log(`Created test-claude-export.jsonl (${Math.round(jsonlContent.length / 1024)}KB)`);
}

// Create a plain text Claude export
function createClaudePlainText() {
  let content = "";
  
  for (let i = 0; i < 100; i++) {
    content += `Human: This is human message ${i}. Can you explain quantum computing?\n\n`;
    content += `Assistant: This is Claude's response ${i}. Quantum computing is a revolutionary approach to computation that leverages quantum mechanical phenomena like superposition and entanglement. Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits or qubits that can exist in multiple states simultaneously.\n\n`;
  }
  
  fs.writeFileSync('test-claude-plain.txt', content);
  console.log(`Created test-claude-plain.txt (${Math.round(content.length / 1024)}KB)`);
}

console.log('Creating test files...');
createLargeChatGPTExport();
createClaudeExport();
createClaudePlainText();
console.log('Test files created successfully!');
