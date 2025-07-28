const fs = require('fs');
const { createHash } = require('crypto');

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '';
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.PINECONE_KEY || '';
const PINECONE_ENV = 'aped-4627-b74a';
const PINECONE_INDEX = 'memory-15be2q5';

console.log('🚀 Starting REAL data ingestion process...');
console.log(`📊 OpenAI API Key: ${OPENAI_API_KEY ? 'Present' : 'Missing'}`);
console.log(`📊 Pinecone API Key: ${PINECONE_API_KEY ? 'Present' : 'Missing'}`);

// Generate embeddings using OpenAI
async function generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-large',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Store vector in Pinecone
async function storeToPinecone(id, embedding, metadata) {
  const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vectors: [{
        id: id,
        values: embedding,
        metadata: metadata
      }]
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Pinecone error:', error);
    throw new Error(`Pinecone API error: ${response.status}`);
  }
}

// Check if message exists
async function checkExists(messageId) {
  try {
    const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/fetch?ids=${messageId}`, {
      method: 'GET',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.vectors && Object.keys(data.vectors).length > 0;
    }
    return false;
  } catch {
    return false;
  }
}

// Extract messages from ChatGPT conversation
function extractMessages(conversation) {
  const messages = [];
  const mapping = conversation.mapping || {};
  
  // Follow conversation tree
  function traverse(nodeId) {
    const node = mapping[nodeId];
    if (!node || !node.message) return;
    
    const msg = node.message;
    const role = msg.author?.role;
    
    if (role === 'user' || role === 'assistant') {
      const content = msg.content?.parts?.join('\n')?.trim();
      if (content && content.length > 0) {
        messages.push({
          role: role,
          content: content,
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : new Date().toISOString(),
          conversationId: conversation.conversation_id || 'unknown',
          conversationTitle: conversation.title || 'Untitled',
          createTime: msg.create_time || Date.now() / 1000,
          model: msg.metadata?.model_slug || 'unknown'
        });
      }
    }
    
    // Traverse children
    if (node.children) {
      for (const childId of node.children) {
        traverse(childId);
      }
    }
  }
  
  if (mapping['client-created-root']) {
    traverse('client-created-root');
  }
  
  return messages.sort((a, b) => a.createTime - b.createTime);
}

// Process ChatGPT export
async function processChatGPTExport() {
  try {
    console.log('📁 Loading ChatGPT export file...');
    const data = JSON.parse(fs.readFileSync('attached_assets/conversations_1753675585521.json', 'utf8'));
    
    console.log('📊 Parsing conversations...');
    let conversations = [];
    if (Array.isArray(data)) {
      conversations = data;
    } else if (data.mapping) {
      conversations = [data];
    } else {
      throw new Error('Invalid ChatGPT export format');
    }
    
    console.log(`📊 Found ${conversations.length} conversations`);
    
    let totalMessages = 0;
    let newMessages = 0;
    let existingMessages = 0;
    let failedMessages = 0;
    
    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      console.log(`🔄 Processing conversation ${i + 1}/${conversations.length}: "${conversation.title}"`);
      
      const messages = extractMessages(conversation);
      console.log(`   📝 Extracted ${messages.length} messages`);
      
      for (const message of messages) {
        totalMessages++;
        
        try {
          const messageId = createHash('sha256')
            .update(`${message.role}:${message.content}:${message.timestamp}`, 'utf8')
            .digest('hex');
          
          // Check if exists
          const exists = await checkExists(messageId);
          if (exists) {
            existingMessages++;
            continue;
          }
          
          // Generate embedding
          const embedding = await generateEmbedding(message.content);
          
          // Prepare metadata
          const metadata = {
            role: message.role,
            timestamp: message.timestamp,
            conversationId: message.conversationId,
            conversationTitle: message.conversationTitle,
            source: 'chatgpt-export',
            model: message.model,
            createTime: message.createTime
          };
          
          // Store in Pinecone
          await storeToPinecone(messageId, embedding, metadata);
          newMessages++;
          
          console.log(`   ✅ Embedded message ${newMessages}/${totalMessages} (${messageId.substring(0, 8)}...)`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`   ❌ Failed to process message:`, error.message);
          failedMessages++;
        }
      }
    }
    
    console.log('🎉 ChatGPT ingestion complete!');
    console.log(`📊 Total conversations: ${conversations.length}`);
    console.log(`📊 Total messages: ${totalMessages}`);
    console.log(`📊 New messages embedded: ${newMessages}`);
    console.log(`📊 Already existed: ${existingMessages}`);
    console.log(`📊 Failed: ${failedMessages}`);
    
    return { conversations: conversations.length, totalMessages, newMessages, existingMessages, failedMessages };
    
  } catch (error) {
    console.error('❌ ChatGPT ingestion failed:', error.message);
    throw error;
  }
}

// Process Claude export
async function processClaudeExport() {
  try {
    console.log('📁 Loading Claude export file...');
    const data = JSON.parse(fs.readFileSync('attached_assets/claude_chat_log_1753681630692.json', 'utf8'));
    
    console.log('📊 Parsing Claude conversations...');
    const conversations = data.conversations || data.chat_messages || [];
    console.log(`📊 Found ${conversations.length} Claude conversations`);
    
    let totalMessages = 0;
    let newMessages = 0;
    let existingMessages = 0;
    let failedMessages = 0;
    
    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      console.log(`🔄 Processing Claude conversation ${i + 1}/${conversations.length}`);
      
      const messages = conversation.chat_messages || conversation.messages || [];
      console.log(`   📝 Found ${messages.length} messages`);
      
      for (const message of messages) {
        totalMessages++;
        
        try {
          let role = message.sender === 'human' ? 'user' : 'assistant';
          let content = message.text || message.content || '';
          
          if (!content || content.trim().length === 0) {
            console.log(`   ⚠️ Skipping empty message`);
            continue;
          }
          
          const timestamp = message.created_at || message.timestamp || new Date().toISOString();
          
          const messageId = createHash('sha256')
            .update(`${role}:${content}:${timestamp}`, 'utf8')
            .digest('hex');
          
          // Check if exists
          const exists = await checkExists(messageId);
          if (exists) {
            existingMessages++;
            continue;
          }
          
          // Generate embedding
          const embedding = await generateEmbedding(content);
          
          // Prepare metadata
          const metadata = {
            role: role,
            timestamp: timestamp,
            conversationId: conversation.uuid || `claude-${i}`,
            conversationTitle: `Claude Conversation ${i + 1}`,
            source: 'claude-log',
            model: 'claude',
            createTime: new Date(timestamp).getTime() / 1000
          };
          
          // Store in Pinecone
          await storeToPinecone(messageId, embedding, metadata);
          newMessages++;
          
          console.log(`   ✅ Embedded Claude message ${newMessages}/${totalMessages} (${messageId.substring(0, 8)}...)`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`   ❌ Failed to process Claude message:`, error.message);
          failedMessages++;
        }
      }
    }
    
    console.log('🎉 Claude ingestion complete!');
    console.log(`📊 Total conversations: ${conversations.length}`);
    console.log(`📊 Total messages: ${totalMessages}`);
    console.log(`📊 New messages embedded: ${newMessages}`);
    console.log(`📊 Already existed: ${existingMessages}`);
    console.log(`📊 Failed: ${failedMessages}`);
    
    return { conversations: conversations.length, totalMessages, newMessages, existingMessages, failedMessages };
    
  } catch (error) {
    console.error('❌ Claude ingestion failed:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting real data ingestion...\n');
    
    // Process ChatGPT export
    console.log('=== CHATGPT EXPORT ===');
    const chatgptResult = await processChatGPTExport();
    
    console.log('\n=== CLAUDE EXPORT ===');
    const claudeResult = await processClaudeExport();
    
    console.log('\n🎯 FINAL SUMMARY:');
    console.log(`📊 ChatGPT: ${chatgptResult.newMessages} new messages from ${chatgptResult.conversations} conversations`);
    console.log(`📊 Claude: ${claudeResult.newMessages} new messages from ${claudeResult.conversations} conversations`);
    console.log(`📊 Total new embeddings: ${chatgptResult.newMessages + claudeResult.newMessages}`);
    
    // Check final Pinecone stats
    console.log('\n📊 Checking final Pinecone statistics...');
    const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/describe_index_stats`, {
      headers: { 'Api-Key': PINECONE_API_KEY }
    });
    const stats = await response.json();
    console.log(`📊 Final vector count: ${stats.totalVectorCount}`);
    
  } catch (error) {
    console.error('❌ Main process failed:', error.message);
    process.exit(1);
  }
}

// Run the ingestion
main();