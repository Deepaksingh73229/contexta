'use client'

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { querySearch } from "@/services/operations/chatAPI";
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  ShieldCheck, 
  Loader2, 
  BrainCircuit,
  Info,
  AlertTriangle
} from 'lucide-react';

const ChatPage = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'ai',
      text: "Hello! I'm Contexta, your secure institutional assistant. I have indexed your uploaded records. What would you like to know?",
      sources: []
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to the bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // 1. Capture the text and clear input immediately for better UX
    const userText = inputValue;
    setInputValue("");
    setIsTyping(true);

    // 2. Add user message to UI
    const newUserMsg = { id: Date.now(), role: 'user', text: userText };
    setMessages(prev => [...prev, newUserMsg]);

    try {
      // 3. Make the REAL API call to your FastAPI backend
      const responseData = await querySearch(userText);

      // 4. Update the UI with the AI's response and retrieved sources
      const aiResponse = {
        id: Date.now() + 1,
        role: 'ai',
        text: responseData.answer,
        sources: responseData.sources || [] // Ensure it's an array even if empty
      };
      
      setMessages(prev => [...prev, aiResponse]);

    } catch (error) {
      // 5. Handle errors gracefully in the chat UI
      const errorMsg = {
        id: Date.now() + 1,
        role: 'ai',
        isError: true, // Custom flag to style errors differently
        text: "I encountered an error connecting to the local database. Please ensure the backend server is running and documents have been ingested.",
        sources: []
      };
      setMessages(prev => [...prev, errorMsg]);
      console.error("Failed to fetch AI response:", error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-950 dark:text-zinc-50">
      
      {/* Top Navigation / Status Bar */}
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Contexta Workspace</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Institutional Knowledge Base</p>
          </div>
        </div>
        
        {/* Security Indicator for Pitching */}
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 gap-1.5 py-1 hidden md:flex">
          <ShieldCheck className="w-3.5 h-3.5" />
          Offline Mode: Active
        </Badge>
      </header>

      {/* Chat History Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {/* AI Avatar */}
              {msg.role === 'ai' && (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-1 border ${
                  msg.isError 
                    ? 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-800' 
                    : 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-800'
                }`}>
                  {msg.isError ? (
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  )}
                </div>
              )}

              {/* Message Bubble */}
              <div className={`max-w-[85%] md:max-w-[75%] space-y-3 ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div 
                  className={`p-4 rounded-2xl text-sm md:text-base leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-sm' 
                      : msg.isError
                        ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 rounded-tl-sm shadow-sm'
                        : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-sm shadow-sm'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Source Citations (Only show if AI has sources and it's not an error) */}
                {msg.role === 'ai' && !msg.isError && msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <Info className="w-3 h-3" /> Sources Retrieved
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, idx) => (
                        <button 
                          key={idx}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="truncate max-w-[200px]">{source.name}</span>
                          <span className="text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded ml-1">
                            Pg {source.page || source.row}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* User Avatar */}
              {msg.role === 'user' && (
                <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center shrink-0 mt-1 order-2">
                  <User className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
             <div className="flex gap-4 justify-start">
               <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0 mt-1">
                 <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
               </div>
               <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
                 <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                 <span className="text-sm text-zinc-500 font-medium">Running local inference...</span>
               </div>
             </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="max-w-4xl mx-auto relative">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question about your documents..."
              className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500 shadow-sm transition-shadow disabled:opacity-60"
              disabled={isTyping}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!inputValue.trim() || isTyping}
              className="absolute right-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 w-10 transition-transform active:scale-95 disabled:opacity-50"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </form>
          <div className="text-center mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Contexta AI runs locally. Verification from the cited source documents is recommended.
          </div>
        </div>
      </div>

    </div>
  );
};

export default ChatPage;