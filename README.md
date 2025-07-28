# Cortex Dashboard - Enhanced RAG Memory System

A production-ready conversational memory system using OpenAI embeddings and Pinecone vector database with GPT-4o integration.

## 🚀 Quick Start

```bash
npm run dev  # Start the application on port 5000
```

Visit: http://localhost:5000

## 🏆 Stable Checkpoint System

This project includes a simple checkpoint system for version management:

### Restore to Known Working State
```bash
./RESTORE_STABLE.sh
```
Instantly restores to stable v1.0 - a fully functional RAG chat interface with no errors.

### Create New Checkpoint
```bash
./CREATE_CHECKPOINT.sh
```
Mark current state as a new stable checkpoint with timestamp.

## 📚 Documentation

- **replit.md** - Complete project architecture and development history
- **STABLE_CHECKPOINT_v1.0.md** - Technical details of the stable v1.0 state
- **docs/** - Additional guides and documentation

## ✅ Current Status (Stable v1.0)

- Clean chat interface without notification popups
- RAG system with 2,872+ vectors fully operational  
- 25% similarity threshold providing excellent recall
- All API endpoints functional with proper authentication
- Real-time conversation embedding and storage working
- Zero runtime errors, production-ready

## 🏗️ Architecture

- **Frontend**: React + TypeScript + shadcn/ui
- **Backend**: Express.js + Node.js  
- **Vector DB**: Pinecone (3072-dimensional embeddings)
- **AI**: OpenAI GPT-4o + text-embedding-3-large
- **Database**: PostgreSQL (via Neon serverless)

## 🐙 GitHub Repository

This project is synced with GitHub at: **https://github.com/cjsjca/cortex-dashboard**

Use Replit's GitHub integration (sidebar) to push updates automatically.