import { createHash } from 'crypto';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.PINECONE_KEY || "";
const PINECONE_ENV = process.env.PINECONE_ENV || process.env.PINECONE_ENVIRONMENT || "aped-4627-b74a";
const PINECONE_INDEX = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME || "memory-15be2q5";

// Core interfaces
interface ChatGPTMessage {
  id: string;
  author: {
    role: string;
    name?: string;
    metadata?: any;
  };
  create_time: number | null;
  update_time?: number | null;
  content: {
    content_type: string;
    parts: string[];
  };
  status: string;
  end_turn?: boolean;
  weight: number;
  metadata?: any;
  recipient?: string;
}

interface ChatGPTNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTNode>;
  moderation_results: any[];
  current_node: string;
  conversation_id?: string;
}

interface ProcessedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata: {
    originalId: string;
    conversationId: string;
    conversationTitle: string;
    turnIndex: number;
    messageIndex: number;
    createTime: number;
    updateTime?: number;
    model?: string;
    source: string;
    parentId?: string;
    requestId?: string;
  };
}

// Generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-large",
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
async function storeToPinecone(id: string, embedding: number[], metadata: any): Promise<void> {
  const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/upsert`, {
    method: "POST",
    headers: {
      "Api-Key": PINECONE_API_KEY,
      "Content-Type": "application/json",
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
    throw new Error(`Pinecone API error: ${response.status} - ${error}`);
  }
}

// Generate unique message ID using SHA256 hash
function generateMessageId(role: string, content: string, timestamp: string): string {
  const hashInput = `${role}:${content}:${timestamp}`;
  return createHash('sha256').update(hashInput, 'utf8').digest('hex');
}

// Check if message already exists in Pinecone
async function checkMessageExists(messageId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io/vectors/fetch?ids=${messageId}`, {
      method: 'GET',
      headers: {
        "Api-Key": PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.vectors && Object.keys(data.vectors).length > 0;
    }
    return false;
  } catch (error) {
    console.warn(`Error checking existence for ${messageId}:`, error);
    return false;
  }
}

// Parse conversation mapping into chronological messages
function parseConversation(conversation: ChatGPTConversation): ProcessedMessage[] {
  const messages: ProcessedMessage[] = [];
  const mapping = conversation.mapping;
  
  // Find conversation flow by following the path to current_node
  function traverseToMessages(nodeId: string, depth: number = 0): void {
    const node = mapping[nodeId];
    if (!node) return;

    const message = node.message;
    if (message && message.author && message.content) {
      // Extract role
      let role: 'user' | 'assistant' | 'system' = message.author.role as any;
      if (role === 'system') return; // Skip system messages
      
      // Normalize role
      if (role !== 'user' && role !== 'assistant') {
        role = 'user'; // Default assumption
      }

      // Extract content
      let content = '';
      if (message.content.parts && message.content.parts.length > 0) {
        content = message.content.parts.join('\n').trim();
      }

      // Skip empty content
      if (!content || content.length === 0) return;

      // Generate timestamp
      const timestamp = message.create_time 
        ? new Date(message.create_time * 1000).toISOString()
        : new Date().toISOString();

      messages.push({
        role: role as 'user' | 'assistant',
        content: content,
        timestamp: timestamp,
        metadata: {
          originalId: message.id,
          conversationId: conversation.conversation_id || 'unknown',
          conversationTitle: conversation.title || 'Untitled',
          turnIndex: depth,
          messageIndex: messages.length,
          createTime: message.create_time || Date.now() / 1000,
          updateTime: message.update_time,
          model: message.metadata?.model_slug || 'unknown',
          source: 'chatgpt-export',
          parentId: node.parent,
          requestId: message.metadata?.request_id
        }
      });
    }

    // Traverse children
    for (const childId of node.children) {
      traverseToMessages(childId, depth + 1);
    }
  }

  // Start traversal from root
  if (mapping['client-created-root']) {
    traverseToMessages('client-created-root');
  }

  return messages.sort((a, b) => a.metadata.createTime - b.metadata.createTime);
}

// Parse full ChatGPT export
function parseFullExport(exportData: any): ChatGPTConversation[] {
  if (!exportData || typeof exportData !== 'object') {
    throw new Error('Invalid export data format');
  }
  
  let conversations: ChatGPTConversation[] = [];
  
  if (Array.isArray(exportData)) {
    conversations = exportData.filter((conv: any) => conv && conv.mapping);
  } else if (exportData.conversations && Array.isArray(exportData.conversations)) {
    conversations = exportData.conversations.filter((conv: any) => conv && conv.mapping);
  } else if (exportData.mapping) {
    conversations = [exportData];
  } else {
    throw new Error('Unrecognized ChatGPT export format');
  }
  
  return conversations;
}

// Process messages in batches with rate limiting
async function processMessagesInBatches(
  messages: ProcessedMessage[],
  batchSize: number = 8,
  rateLimit: number = 150
): Promise<{
  totalMessages: number;
  alreadyInMemory: number;
  newlyEmbedded: number;
  failed: number;
}> {
  let alreadyInMemory = 0;
  let newlyEmbedded = 0;
  let failed = 0;

  console.log(`Processing ${messages.length} messages in batches of ${batchSize}`);

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messages.length / batchSize)}`);

    for (const message of batch) {
      try {
        const messageId = generateMessageId(message.role, message.content, message.timestamp);
        
        // Check if already exists
        const exists = await checkMessageExists(messageId);
        if (exists) {
          alreadyInMemory++;
          continue;
        }

        // Generate embedding and store
        const embedding = await generateEmbedding(message.content);
        
        // Prepare metadata for Pinecone (no null values)
        const pineconeMetadata = {
          role: message.role,
          timestamp: message.timestamp,
          conversationId: message.metadata.conversationId,
          conversationTitle: message.metadata.conversationTitle,
          source: message.metadata.source,
          model: message.metadata.model || 'unknown',
          turnIndex: message.metadata.turnIndex,
          createTime: message.metadata.createTime
        };

        await storeToPinecone(messageId, embedding, pineconeMetadata);
        newlyEmbedded++;
        
        console.log(`✓ Embedded message ${messageId.substring(0, 8)}... (${newlyEmbedded}/${messages.length})`);
        
      } catch (error) {
        console.error(`Failed to process message:`, error);
        failed++;
      }
    }

    // Rate limiting
    if (i + batchSize < messages.length) {
      await new Promise(resolve => setTimeout(resolve, rateLimit));
    }
  }

  return {
    totalMessages: messages.length,
    alreadyInMemory,
    newlyEmbedded,
    failed
  };
}

// Main ingestion function
export async function ingestChatGPTExport(exportData: any): Promise<{
  totalConversations: number;
  totalMessages: number;
  alreadyInMemory: number;
  newlyEmbedded: number;
  failed: number;
  elapsedTime: string;
}> {
  const startTime = Date.now();
  
  console.log('[CHATGPT INGESTION] Starting ChatGPT export processing');
  
  // Parse conversations
  const conversations = parseFullExport(exportData);
  console.log(`Found ${conversations.length} conversations`);
  
  // Extract all messages
  const allMessages: ProcessedMessage[] = [];
  for (const conversation of conversations) {
    const messages = parseConversation(conversation);
    allMessages.push(...messages);
  }
  
  console.log(`Extracted ${allMessages.length} total messages`);
  
  // Process messages
  const result = await processMessagesInBatches(allMessages);
  
  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = elapsedTime % 60;
  const elapsedFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  console.log(`[CHATGPT INGESTION] Complete in ${elapsedFormatted}`);
  console.log(`  → Total messages: ${result.totalMessages}`);
  console.log(`  → Already in memory: ${result.alreadyInMemory}`);
  console.log(`  → Newly embedded: ${result.newlyEmbedded}`);
  console.log(`  → Failed: ${result.failed}`);
  
  return {
    totalConversations: conversations.length,
    totalMessages: result.totalMessages,
    alreadyInMemory: result.alreadyInMemory,
    newlyEmbedded: result.newlyEmbedded,
    failed: result.failed,
    elapsedTime: elapsedFormatted
  };
}