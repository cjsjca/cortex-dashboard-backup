import { ChatInterface } from "@/components/chat-interface";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Database, CheckCircle, XCircle } from "lucide-react";

export default function Dashboard() {
  const { data: status } = useQuery({
    queryKey: ['/api/status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-gray-900 shadow-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Database className="text-white text-sm" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Cortex Dashboard</h1>
                <p className="text-sm text-gray-300">Enhanced RAG Memory System</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* RAG Chat Interface Section */}
        <div className="mt-8">
          <ChatInterface />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4 text-sm text-gray-300">
              <span>Cortex v1.0.0</span>
              <span>•</span>
              <span>Enhanced RAG Pipeline</span>
              <span>•</span>
              <span>OpenAI + Pinecone</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
