# ChatGPT Data Ingestion Guide

## Overview

The ChatGPT Data Ingestion system allows you to import your existing ChatGPT conversation history into your Pinecone Memory Server. This enables your AI assistant to learn from and reference your past conversations.

## Features

### 1. Parsing and Cleaning
- **JSON Parsing**: Handles ChatGPT export JSON files with complex conversation trees
- **Content Extraction**: Extracts text content, timestamps, and role information
- **Tree Traversal**: Processes conversation branches and maintains chronological order
- **Text Cleaning**: Removes excessive whitespace and normalizes content for embedding

### 2. Metadata Management
- **Comprehensive Metadata**: Stores conversation titles, timestamps, user/assistant roles
- **Source Tracking**: Labels all imported data with 'chatgpt-export' source
- **Model Information**: Preserves ChatGPT model information (GPT-3.5, GPT-4, etc.)
- **Conversation Context**: Maintains conversation hierarchy and message relationships

### 3. Embedding Process
- **OpenAI Integration**: Uses text-embedding-3-large (3072 dimensions) for consistency
- **Batch Processing**: Processes messages in batches of 10 to avoid rate limits
- **Error Handling**: Robust error handling with detailed logging
- **Dual Storage**: Stores in both PostgreSQL and Pinecone simultaneously

### 4. Labeling and Organization
- **Clear Role Labels**: Distinguishes between 'user' and 'assistant' messages
- **Conversation Grouping**: Groups messages by conversation ID and title
- **Temporal Ordering**: Maintains chronological order of conversations
- **Unique Identification**: Each message gets unique ID for tracking

## API Endpoints

### File Upload Endpoint
```
POST /api/ingest-chatgpt
Content-Type: multipart/form-data
Headers: x-api-key: [your-api-key]

Form Data:
- chatgpt_export: [JSON file]
```

### JSON Body Endpoint
```
POST /api/ingest-chatgpt-json
Content-Type: application/json
Headers: x-api-key: [your-api-key]

Body: [ChatGPT conversation JSON]
```

## Usage Instructions

### Step 1: Export ChatGPT Data
1. Go to ChatGPT Settings → Data Controls
2. Click "Export data"
3. Wait for email with download link
4. Download and extract the ZIP file
5. Locate `conversations.json` file

### Step 2: Upload to Memory Server
1. Open the Admin Dashboard
2. Navigate to the "ChatGPT Data Ingestion" section
3. Click "Choose ChatGPT JSON export file"
4. Select your `conversations.json` file
5. Click "Upload & Process"
6. Wait for processing to complete

### Step 3: Verify Import
1. Use the Memory Search to test imported conversations
2. Check the Chat Interface to see if it references imported memories
3. Review Server Logs for any errors or issues

## Data Format Support

### Supported ChatGPT Export Formats
- **Single Conversation**: Individual conversation JSON objects
- **Batch Export**: Array of conversation objects from full export
- **All Models**: GPT-3.5, GPT-4, GPT-4o conversations
- **All Content Types**: Text conversations (images and files not yet supported)

### Metadata Structure
```typescript
{
  originalId: string;           // Original ChatGPT message ID
  conversationId: string;       // ChatGPT conversation ID
  conversationTitle: string;    // Conversation title
  messageIndex: number;         // Position in conversation
  createTime: number;           // Unix timestamp
  updateTime?: number;          // Last update timestamp
  modelSlug?: string;           // GPT model used
  source: 'chatgpt-export';     // Source identifier
  parentId?: string;            // Parent message ID
  requestId?: string;           // ChatGPT request ID
}
```

## Processing Details

### Conversation Tree Processing
1. **Root Detection**: Finds conversation starting points
2. **Branch Traversal**: Follows conversation branches recursively
3. **Duplicate Prevention**: Avoids processing same message multiple times
4. **Chronological Sorting**: Orders messages by creation timestamp

### Embedding Generation
1. **Text Cleaning**: Normalizes whitespace and formatting
2. **Content Validation**: Skips empty or system messages
3. **Embedding Creation**: Generates 3072-dimensional vectors
4. **Metadata Separation**: Keeps metadata separate from embeddings

### Error Handling
- **File Validation**: Checks JSON format and structure
- **Rate Limiting**: Includes delays to avoid API limits
- **Batch Recovery**: Continues processing even if individual messages fail
- **Detailed Logging**: Provides comprehensive error information

## Performance Considerations

### Batch Processing
- Processes 10 messages at a time
- 100ms delay between batches
- Progress tracking and reporting
- Memory-efficient streaming

### Large File Support
- 50MB file size limit
- Memory-based upload handling
- Efficient JSON parsing
- Incremental processing

### Rate Limiting
- Built-in delays for OpenAI API
- Configurable batch sizes
- Error recovery mechanisms
- Progress monitoring

## Troubleshooting

### Common Issues
1. **"Invalid JSON file format"**: Ensure file is valid JSON from ChatGPT export
2. **"API rate limit exceeded"**: Wait and retry, or reduce batch size
3. **"No valid messages found"**: Check if conversation contains actual text messages
4. **Memory errors**: For very large files, consider splitting into smaller chunks

### Best Practices
1. Start with smaller files to test the system
2. Monitor server logs during processing
3. Verify imported data with test searches
4. Keep original export files as backup
5. Process conversations during low-traffic periods

## Integration with RAG System

Once imported, ChatGPT conversations become part of your RAG (Retrieval-Augmented Generation) system:

1. **Semantic Search**: Your AI can find relevant past conversations
2. **Context Awareness**: References previous discussions naturally
3. **Learning Continuity**: Builds on past interactions and knowledge
4. **Personalization**: Adapts responses based on conversation history

The imported conversations enhance your AI assistant's ability to provide contextual, personalized responses based on your complete conversation history.