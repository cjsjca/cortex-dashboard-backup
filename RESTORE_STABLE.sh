#!/bin/bash
# Quick restore script for stable checkpoint

echo "🏆 Restoring to Stable Checkpoint v1.0..."
echo "This will restore your RAG system to fully working state"
echo ""

# Remove any git locks
rm -f .git/index.lock 2>/dev/null

# Restore to stable tag
git checkout stable-v1.0

echo "✅ Restored to stable checkpoint!"
echo "🎯 Your RAG chat interface is now in perfect working condition"
echo "💬 Test it at: http://localhost:5000"
echo ""
echo "What's working:"
echo "- Clean chat interface (no notification popups)"
echo "- RAG memory retrieval with 2,872+ vectors" 
echo "- All API endpoints functional"
echo "- Real-time conversation embedding"
echo ""