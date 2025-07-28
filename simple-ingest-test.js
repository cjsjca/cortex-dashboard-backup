import fs from 'fs';
import crypto from 'crypto';

// Simple ingestion test script
async function testSimpleIngestion() {
  console.log('🚀 Testing simple ingestion approach...');
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
  
  if (!OPENAI_API_KEY || !PINECONE_API_KEY) {
    console.error('Missing API keys');
    return;
  }
  
  // Load your ChatGPT export
  const data = JSON.parse(fs.readFileSync('attached_assets/conversations_1753675585521.json', 'utf8'));
  console.log('📁 File loaded');
  
  // Simple message extraction
  const messages = [];
  const conversations = Array.isArray(data) ? data : [data];
  
  for (const conv of conversations) {
    if (!conv.mapping) continue;
    
    Object.values(conv.mapping).forEach(node => {
      if (node.message?.author?.role && node.message?.content?.parts) {
        const role = node.message.author.role;
        if (role === 'user' || role === 'assistant') {
          let content = '';
          
          if (Array.isArray(node.message.content.parts)) {
            content = node.message.content.parts
              .filter(part => part && typeof part === 'string')
              .join(' ');
          }
          
          content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (content.length > 0) {
            messages.push({
              role,
              content,
              timestamp: new Date(node.message.create_time * 1000).toISOString(),
              conversationId: conv.conversation_id || 'unknown'
            });
          }
        }
      }
    });
  }
  
  console.log(`📊 Extracted ${messages.length} messages`);
  
  // Test embedding 10 messages
  let embedded = 0;
  for (let i = 0; i < Math.min(10, messages.length); i++) {
    const msg = messages[i];
    
    try {
      // Generate ID
      const id = crypto.createHash('sha256')
        .update(`${msg.role}:${msg.content}:${msg.timestamp}`)
        .digest('hex');
      
      // Generate embedding
      const embRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: msg.content.substring(0, 8000),
          model: 'text-embedding-3-large'
        })
      });
      
      if (!embRes.ok) throw new Error(`Embedding failed: ${embRes.status}`);
      const embData = await embRes.json();
      
      // Store in Pinecone
      const storeRes = await fetch('https://memory-15be2q5.svc.aped-4627-b74a.pinecone.io/vectors/upsert', {
        method: 'POST',
        headers: {
          'Api-Key': PINECONE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vectors: [{
            id,
            values: embData.data[0].embedding,
            metadata: {
              role: msg.role,
              content: msg.content.substring(0, 1000),
              timestamp: msg.timestamp,
              conversationId: msg.conversationId,
              source: 'simple-ingest'
            }
          }]
        })
      });
      
      if (!storeRes.ok) throw new Error(`Storage failed: ${storeRes.status}`);
      
      embedded++;
      console.log(`✅ ${embedded}: ${msg.role} - ${msg.content.substring(0, 50)}...`);
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log(`🎉 Simple ingestion test complete: ${embedded}/10 messages embedded`);
}

testSimpleIngestion().catch(console.error);