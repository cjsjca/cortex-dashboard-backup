#!/usr/bin/env node

// Quick ChatGPT ingestion script - bypasses TypeScript compilation issues
// Run with: node QUICK_INGEST.js

const fs = require('fs');
const { createHash } = require('crypto');

console.log('🚀 Cortex Quick Ingestion Tool');
console.log('==============================\n');

// Environment setup
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.PINECONE_KEY;
const PINECONE_ENV = 'aped-4627-b74a';
const PINECONE_INDEX = 'memory-15be2q5';

if (!OPENAI_API_KEY || !PINECONE_API_KEY) {
  console.error('❌ Missing API keys. Check environment variables.');
  process.exit(1);
}

console.log('✅ API keys verified');
console.log(`✅ Target: ${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io\n`);

// Core functions
async function generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text.substring(0, 8000), // Limit for safety
      model: 'text-embedding-3-large',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function storeToPinecone(vectors) {
  const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ vectors }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinecone error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function checkExists(messageIds) {
  try {
    const idsParam = messageIds.join(',');
    const response = await fetch(
      `https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/fetch?ids=${idsParam}`,
      {
        method: 'GET',
        headers: {
          'Api-Key': PINECONE_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return Object.keys(data.vectors || {});
    }
    return [];
  } catch {
    return [];
  }
}

function generateMessageId(role, content, timestamp) {
  const hashInput = `${role}:${content}:${timestamp}`;
  return createHash('sha256').update(hashInput, 'utf8').digest('hex');
}

function extractMessagesFromConversation(conversation) {
  const messages = [];
  const mapping = conversation.mapping || {};
  
  function traverse(nodeId, depth = 0) {
    const node = mapping[nodeId];
    if (!node || !node.message) return;
    
    const msg = node.message;
    const role = msg.author?.role;
    
    if ((role === 'user' || role === 'assistant') && msg.content?.parts) {
      const content = msg.content.parts
        .filter(part => part && typeof part === 'string')
        .join('\n')
        .trim();
      
      if (content.length > 0) {
        messages.push({
          role,
          content,
          timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : new Date().toISOString(),
          conversationId: conversation.conversation_id || 'unknown',
          conversationTitle: conversation.title || 'Untitled',
          createTime: msg.create_time || Date.now() / 1000,
          model: msg.metadata?.model_slug || 'unknown',
          originalId: msg.id
        });
      }
    }
    
    if (node.children) {
      for (const childId of node.children) {
        traverse(childId, depth + 1);
      }
    }
  }
  
  if (mapping['client-created-root']) {
    traverse('client-created-root');
  }
  
  return messages.sort((a, b) => a.createTime - b.createTime);
}

async function main() {
  try {
    // Load and parse ChatGPT export
    console.log('📁 Loading ChatGPT export...');
    const chatgptPath = 'attached_assets/conversations_1753675585521.json';
    
    if (!fs.existsSync(chatgptPath)) {
      console.error(`❌ File not found: ${chatgptPath}`);
      process.exit(1);
    }
    
    const data = JSON.parse(fs.readFileSync(chatgptPath, 'utf8'));
    console.log('✅ File loaded successfully');
    
    // Parse conversations
    let conversations = [];
    if (Array.isArray(data)) {
      conversations = data;
    } else if (data.mapping) {
      conversations = [data];
    } else {
      throw new Error('Invalid ChatGPT export format');
    }
    
    console.log(`📊 Found ${conversations.length} conversations`);
    
    // Extract all messages
    let allMessages = [];
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const messages = extractMessagesFromConversation(conv);
      allMessages.push(...messages);
      
      if ((i + 1) % 10 === 0 || i === conversations.length - 1) {
        console.log(`   Processed ${i + 1}/${conversations.length} conversations (${allMessages.length} messages so far)`);
      }
    }
    
    console.log(`📊 Total messages extracted: ${allMessages.length}\n`);
    
    // Process in batches
    const batchSize = 10;
    let embedded = 0;
    let skipped = 0;
    let failed = 0;
    
    console.log('🔄 Starting embedding process...');
    
    for (let i = 0; i < allMessages.length; i += batchSize) {
      const batch = allMessages.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allMessages.length / batchSize);
      
      console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} messages)`);
      
      try {
        // Generate message IDs
        const messageIds = batch.map(msg => 
          generateMessageId(msg.role, msg.content, msg.timestamp)
        );
        
        // Check which already exist
        const existingIds = await checkExists(messageIds);
        const newMessages = batch.filter((_, idx) => 
          !existingIds.includes(messageIds[idx])
        );
        
        console.log(`   📋 ${batch.length - newMessages.length} already exist, ${newMessages.length} new`);
        skipped += batch.length - newMessages.length;
        
        if (newMessages.length === 0) continue;
        
        // Generate embeddings and store
        const vectors = [];
        for (let j = 0; j < newMessages.length; j++) {
          const msg = newMessages[j];
          const messageId = generateMessageId(msg.role, msg.content, msg.timestamp);
          
          try {
            const embedding = await generateEmbedding(msg.content);
            
            vectors.push({
              id: messageId,
              values: embedding,
              metadata: {
                role: msg.role,
                timestamp: msg.timestamp,
                conversationId: msg.conversationId,
                conversationTitle: msg.conversationTitle,
                source: 'chatgpt-export',
                model: msg.model,
                createTime: msg.createTime
              }
            });
            
            console.log(`     ✅ ${j + 1}/${newMessages.length}: ${msg.role} message (${messageId.substring(0, 8)}...)`);
            
          } catch (error) {
            console.log(`     ❌ Failed to embed message: ${error.message}`);
            failed++;
          }
        }
        
        // Store batch to Pinecone
        if (vectors.length > 0) {
          await storeToPinecone(vectors);
          embedded += vectors.length;
          console.log(`   💾 Stored ${vectors.length} vectors to Pinecone`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`   ❌ Batch ${batchNum} failed: ${error.message}`);
        failed += batch.length;
      }
    }
    
    // Final results
    console.log('\n🎉 INGESTION COMPLETE!');
    console.log('====================');
    console.log(`📊 Total messages: ${allMessages.length}`);
    console.log(`✅ Successfully embedded: ${embedded}`);
    console.log(`⏭️  Already existed: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    
    // Check final Pinecone stats
    console.log('\n📊 Final Pinecone statistics:');
    const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/describe_index_stats`, {
      headers: { 'Api-Key': PINECONE_API_KEY }
    });
    const stats = await response.json();
    console.log(`📈 Total vectors in index: ${stats.totalVectorCount}`);
    
    console.log('\n✨ Your ChatGPT conversations are now searchable in Cortex!');
    
  } catch (error) {
    console.error('❌ Process failed:', error.message);
    process.exit(1);
  }
}

// Run the ingestion
main();