# 🔧 Ingestion Tools - Separate Module

## Overview
This folder contains the bulk data ingestion tools that are **completely separate** from the core RAG system. These tools are used for one-time data imports and batch processing of conversation exports.

## 📂 Folder Structure
```
ingestion-tools/
├── ingest-real-data.js       # Production ChatGPT export processing
├── QUICK_INGEST.js          # Fast ingestion utility
├── check-duplicates.js      # Duplicate detection
├── create-test-files.js     # Test data generation
└── simple-ingest-test.js    # Testing and validation
```

## 🚨 **Important Separation**
- **Core RAG System**: `/server/routes.ts`, `/client/src/` - Real-time chat functionality
- **Ingestion Tools**: `/ingestion-tools/` - Bulk data processing (this folder)

## 🎯 **When to Use**
- **Core RAG**: Daily chat interactions, real-time memory storage
- **Ingestion Tools**: One-time ChatGPT export imports, bulk data migration

## 🔧 **Usage**
```bash
# Run ingestion tools (separate from main app)
node ingestion-tools/ingest-real-data.js
node ingestion-tools/QUICK_INGEST.js
node ingestion-tools/check-duplicates.js

# Run core RAG system
npm run dev  # Starts main chat interface
```

## 📋 **Clear Boundaries**
- Ingestion tools are **standalone scripts**
- They connect to the same Pinecone/OpenAI services
- But they run **independently** from the web application
- No mixing of bulk processing with real-time chat functionality

This separation ensures the core RAG system stays clean and focused on real-time chat, while ingestion tools handle heavy data processing separately.