import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageCircle, Send, Bot, User, Clock, Database } from "lucide-react";

interface ChatResponse {
  success: boolean;
  response: string;
  userMessageId: string;
  assistantMessageId: string;
  retrievedCount: number;
  totalCandidates: number;
  tokensUsed: number;
  minSimilarityThreshold: number;
  retrievedMemories: Array<{
    id: string;
    content: string;
    score: number;
    timestamp: string;
    role: string;
    source: string;
    formattedDate: string;
  }>;
  promptDetails: {
    systemMessageLength: number;
    userMessageLength: number;
    currentTime: string;
    finalPrompt: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  memoryId?: string;
  retrievedCount?: number;
}

export function ChatInterface() {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [showRetrievedMemories, setShowRetrievedMemories] = useState(false);
  const [lastRetrievedMemories, setLastRetrievedMemories] = useState<ChatResponse['retrievedMemories']>([]);
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string): Promise<ChatResponse> => {
      const response = await apiRequest('POST', '/api/chat', { message: userMessage });
      return response.json();
    },
    onSuccess: (data) => {
      const assistantTimestamp = new Date().toISOString();
      
      // Add assistant response to history
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: assistantTimestamp,
        memoryId: data.assistantMessageId,
        retrievedCount: data.retrievedCount
      }]);

      // Store retrieved memories for reference
      setLastRetrievedMemories(data.retrievedMemories);
    },
    onError: (error) => {
      toast({
        title: "Chat Failed",
        description: error instanceof Error ? error.message : "Failed to generate response",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }

    // Add user message to history immediately
    const userTimestamp = new Date().toISOString();
    setChatHistory(prev => [...prev, {
      role: 'user',
      content: message,
      timestamp: userTimestamp
    }]);

    // Store the message and clear input before sending
    const userMessage = message;
    setMessage('');
    
    // Send to backend
    chatMutation.mutate(userMessage);
  };

  return (
    <div className="space-y-6">
      {/* Chat Interface Header */}
      <Card className="bg-gray-900 border-gray-700 text-white">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-white">Enhanced RAG Chat Interface</CardTitle>
              <p className="text-sm text-gray-300">High-fidelity semantic and temporal recall with advanced filtering</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chat History */}
          <div className="max-h-96 overflow-y-auto border border-gray-600 rounded-lg p-4 bg-gray-800">
            {chatHistory.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                <p>Start a conversation to see chat history</p>
              </div>
            ) : (
              chatHistory.map((msg, index) => (
                <div key={index} className={`flex items-start space-x-3 mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-green-400" />
                    </div>
                  )}
                  <div className={`max-w-xs lg:max-w-lg px-4 py-3 rounded-lg shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-sm' 
                      : 'bg-gray-700 border border-gray-600 rounded-bl-sm text-white'
                  }`}>
                    <div className={`text-xs font-medium mb-1 ${
                      msg.role === 'user' ? 'text-blue-100' : 'text-gray-300'
                    }`}>
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <p className={`text-sm leading-relaxed ${
                      msg.role === 'user' ? 'text-white' : 'text-white'
                    }`}>
                      {msg.content}
                    </p>
                    <div className={`flex items-center justify-between mt-2 text-xs ${
                      msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                    }`}>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      {msg.retrievedCount !== undefined && (
                        <span className="flex items-center ml-2">
                          <Database className="w-3 h-3 mr-1" />
                          {msg.retrievedCount} memories
                        </span>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                  )}
                </div>
              ))
            )}
            
            {/* Loading indicator when waiting for response */}
            {chatMutation.isPending && (
              <div className="flex items-start space-x-3 justify-start mb-4">
                <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-green-400" />
                </div>
                <div className="bg-gray-700 border border-gray-600 rounded-lg rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="text-xs font-medium text-gray-300 mb-1">Assistant</div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-300">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={chatMutation.isPending}
              className="flex-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
            />
            <Button type="submit" disabled={chatMutation.isPending || !message.trim()}>
              {chatMutation.isPending ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>

          {/* Retrieved Memories Toggle */}
          {lastRetrievedMemories && lastRetrievedMemories.length > 0 && (
            <div className="border-t pt-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowRetrievedMemories(!showRetrievedMemories)}
              >
                {showRetrievedMemories ? 'Hide' : 'Show'} Retrieved Memories ({lastRetrievedMemories?.length || 0})
              </Button>
              
              {showRetrievedMemories && lastRetrievedMemories && (
                <div className="mt-3 space-y-2">
                  {lastRetrievedMemories.map((memory, index) => (
                    <div key={memory.id} className="bg-gray-700 border border-gray-600 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-300">Memory {index + 1}</span>
                        <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                          Score: {memory.score.toFixed(3)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{memory.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}