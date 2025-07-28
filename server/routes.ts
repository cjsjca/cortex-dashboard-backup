import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import { storage } from "./storage";
import path from "path";
import { logConversationSchema, searchMemorySchema, type SearchResult } from "@shared/schema";
import { z } from "zod";

// OpenAI and Pinecone integration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.PINECONE_KEY || "";
const PINECONE_ENV = process.env.PINECONE_ENV || process.env.PINECONE_ENVIRONMENT || "aped-4627-b74a";
const PINECONE_INDEX = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME || "memory-15be2q5";

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

interface PineconeQueryResponse {
  matches: Array<{
    id: string;
    score: number;
    metadata: any;
  }>;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Helper function to generate embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 3072
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();
  return data.data[0].embedding;
}

// Helper function to search Pinecone
async function searchPinecone(embedding: number[], topK: number = 15): Promise<PineconeQueryResponse> {
  const response = await fetch(`https://memory-15be2q5.svc.aped-4627-b74a.pinecone.io/query`, {
    method: "POST",
    headers: {
      "Api-Key": PINECONE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vector: embedding,
      topK,
      includeMetadata: true,
      includeValues: false
    }),
  });

  if (!response.ok) {
    throw new Error(`Pinecone API error: ${response.statusText}`);
  }

  return response.json();
}

// Generate GPT-4o response with memory context
async function generateChatResponse(
  userMessage: string, 
  memoryContext: Array<{content: string, metadata: any, score: number}>
): Promise<OpenAIChatResponse> {
  // Get current Pacific Time
  const pacificTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  // Filter memories by minimum similarity threshold (25%)
  const relevantMemories = memoryContext.filter(memory => memory.score >= 0.25);
  
  // Sort by combination of similarity and temporal proximity
  const currentTime = Date.now();
  const enrichedMemories = relevantMemories.map(memory => {
    const timestamp = memory.metadata?.timestamp ? new Date(memory.metadata.timestamp).getTime() : 0;
    const temporalScore = Math.max(0, 1 - (currentTime - timestamp) / (365 * 24 * 60 * 60 * 1000)); // Decay over 1 year
    const combinedScore = (memory.score * 0.7) + (temporalScore * 0.3); // 70% semantic, 30% temporal
    
    return {
      ...memory,
      combinedScore,
      temporalScore
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore);

  // Build memory context string with token budget management (~3000 tokens max)
  let memoryText = "";
  let tokenEstimate = 0;
  const maxTokens = 3000;

  for (const memory of enrichedMemories) {
    const role = memory.metadata?.role || 'unknown';
    const timestamp = memory.metadata?.timestamp ? 
      new Date(memory.metadata.timestamp).toLocaleDateString() : 'Unknown date';
    
    const roleLabel = role === 'user' ? 'You asked' : 'Previously I said';
    const memoryLine = `[${timestamp}] ${roleLabel}: "${memory.content}"\n`;
    
    // Rough token estimation (1 token ≈ 4 characters)
    const lineTokens = Math.ceil(memoryLine.length / 4);
    
    if (tokenEstimate + lineTokens > maxTokens) {
      break; // Stop adding memories if we exceed token budget
    }
    
    memoryText += memoryLine;
    tokenEstimate += lineTokens;
  }

  const systemPrompt = `You are an intelligent assistant with access to conversation memories. Current Pacific Time: ${pacificTime}

Use the memory context below to provide informed, helpful responses. If the memories contain relevant information for the user's question, incorporate that context naturally. If the memories don't contain relevant information, respond normally and mention that you don't have that specific information in memory.

Memory Context:
${memoryText || "No relevant memories found for this query."}

Guidelines:
- Provide helpful, accurate responses based on available memory context
- If you reference memory context, do so naturally without explicitly mentioning "memory" or "context"
- If no relevant memories are available, respond based on your general knowledge
- Be conversational and maintain the user's preferred communication style`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", 
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1000,
      temperature: 0.7
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Chat API error: ${response.statusText}`);
  }

  return response.json();
}

// API key validation middleware
function validateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY || "cortex-memory-key-2024";
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ 
      success: false, 
      error: "Invalid or missing API key" 
    });
  }
  
  next();
}

export function registerRoutes(app: Express): Server {
  // Status endpoint - no auth required
  app.get("/api/status", async (req, res) => {
    try {
      res.json({
        success: true,
        status: "online",
        timestamp: new Date().toISOString(),
        environment: {
          openai: !!OPENAI_API_KEY,
          pinecone: !!PINECONE_API_KEY,
          index: PINECONE_INDEX,
          environment: PINECONE_ENV
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Status check failed"
      });
    }
  });

  // Protected endpoints require API key
  app.use("/api/log-conversation", validateApiKey);
  app.use("/api/chat", validateApiKey);
  app.use("/api/rag-debug", validateApiKey);

  // Log conversation endpoint
  app.post("/api/log-conversation", async (req, res) => {
    try {
      const { messages } = logConversationSchema.parse(req.body);
      
      // Combine messages into a single text string
      const conversationText = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      
      // Generate embedding
      const embedding = await generateEmbedding(conversationText);
      
      // Store in PostgreSQL
      const memory = await storage.logConversation({
        content: conversationText,
        embedding,
        metadata: { messages, timestamp: new Date().toISOString() }
      });

      // Also store in Pinecone
      const pineconeId = createHash('sha256')
        .update(conversationText + new Date().toISOString())
        .digest('hex');

      await fetch(`https://memory-15be2q5.svc.aped-4627-b74a.pinecone.io/vectors/upsert`, {
        method: "POST",
        headers: {
          "Api-Key": PINECONE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vectors: [{
            id: pineconeId,
            values: embedding,
            metadata: {
              content: conversationText,
              timestamp: new Date().toISOString(),
              source: "api",
              messageCount: messages.length
            }
          }]
        }),
      });

      res.json({
        success: true,
        memoryId: memory.id,
        pineconeId,
        message: "Conversation logged successfully"
      });
    } catch (error) {
      console.error("Error logging conversation:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });



  // Chat endpoint with RAG
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = z.object({ message: z.string() }).parse(req.body);
      
      // Generate embedding for the user message
      const queryEmbedding = await generateEmbedding(message);
      
      // Search for relevant memories
      const searchResults = await searchPinecone(queryEmbedding, 15);
      
      // Format memory context
      const memoryContext = searchResults.matches.map(match => ({
        content: match.metadata?.content || "",
        metadata: match.metadata || {},
        score: match.score
      }));

      // Generate GPT-4o response with memory context
      const chatResponse = await generateChatResponse(message, memoryContext);
      
      res.json({
        success: true,
        response: chatResponse.choices[0].message.content,
        memoryCount: memoryContext.length,
        relevantMemories: memoryContext.filter(m => m.score >= 0.25).length,
        usage: chatResponse.usage
      });
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // RAG debug endpoint
  app.post("/api/rag-debug", async (req, res) => {
    try {
      const { message } = z.object({ message: z.string() }).parse(req.body);
      
      // Generate embedding for the user message
      const queryEmbedding = await generateEmbedding(message);
      
      // Search for relevant memories
      const searchResults = await searchPinecone(queryEmbedding, 15);
      
      // Format memory context with detailed analysis
      const memoryAnalysis = searchResults.matches.map(match => {
        const timestamp = match.metadata?.timestamp ? new Date(match.metadata.timestamp).getTime() : 0;
        const currentTime = Date.now();
        const temporalScore = Math.max(0, 1 - (currentTime - timestamp) / (365 * 24 * 60 * 60 * 1000));
        const combinedScore = (match.score * 0.7) + (temporalScore * 0.3);
        
        return {
          id: match.id,
          content: match.metadata?.content?.substring(0, 200) + "...",
          similarity: match.score,
          temporalScore,
          combinedScore,
          metadata: {
            role: match.metadata?.role,
            timestamp: match.metadata?.timestamp,
            source: match.metadata?.source,
            conversationId: match.metadata?.conversationId
          },
          passesThreshold: match.score >= 0.25
        };
      });

      const relevantMemories = memoryAnalysis.filter(m => m.passesThreshold);
      
      res.json({
        success: true,
        query: message,
        totalCandidates: memoryAnalysis.length,
        relevantMemories: relevantMemories.length,
        similarityThreshold: 0.25,
        memories: memoryAnalysis,
        analysis: {
          averageSimilarity: memoryAnalysis.reduce((sum, m) => sum + m.similarity, 0) / memoryAnalysis.length,
          highestSimilarity: Math.max(...memoryAnalysis.map(m => m.similarity)),
          memoryTimespan: {
            earliest: Math.min(...memoryAnalysis.map(m => new Date(m.metadata.timestamp || 0).getTime())),
            latest: Math.max(...memoryAnalysis.map(m => new Date(m.metadata.timestamp || 0).getTime()))
          }
        }
      });
    } catch (error) {
      console.error("Error in RAG debug endpoint:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}