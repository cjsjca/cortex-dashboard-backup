import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const memories = pgTable("memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  embedding: real("embedding").array().notNull(), // 3072-dimensional vector
  metadata: jsonb("metadata").notNull(), // Store original messages, timestamp, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMemorySchema = createInsertSchema(memories).pick({
  content: true,
  embedding: true,
  metadata: true,
});

export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type Memory = typeof memories.$inferSelect;

// API schemas
export const logConversationSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })),
});

export const searchMemorySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().optional(),
});

export type LogConversationRequest = z.infer<typeof logConversationSchema>;
export type SearchMemoryRequest = z.infer<typeof searchMemorySchema>;

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  timestamp: string;
  metadata: any;
}
