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
  TerminalSquare,
  Sparkles,
  ArrowRight
} from 'lucide-react';

const ChatPage = () => {
  const [messages, setMessages] = useState([]); // Start empty to show the cool welcome screen
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (e, suggestedText = null) => {
    if (e) e.preventDefault();
    const textToSend = suggestedText || inputValue;
    if (!textToSend.trim()) return;

    setInputValue("");
    setIsTyping(true);

    const newUserMsg = { id: Date.now(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, newUserMsg]);

    try {
      const responseData = await querySearch(textToSend);

      const aiResponse = {
        id: Date.now() + 1,
        role: 'ai',
        text: responseData.answer,
        sources: responseData.sources || [] 
      };
      
      setMessages(prev => [...prev, aiResponse]);

    } catch (error) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'ai',
        isError: true,
        text: "Connection error. Ensure the local Contexta backend is running via FastAPI and documents are ingested.",
        sources: []
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // Suggested prompts for the empty state
  const suggestions = [
    "How many students passed out in the 2016 batch?",
    "What is the protocol for visitor hours?",
    "List the top placement packages recorded.",
    "Summarize the faculty leave policy."
  ];

  return (
    <div className="flex flex-col bg-[#0A0A0C] text-zinc-100 font-sans relative overflow-hidden">
      
      {/* Subtle Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full pointer-events-none"></div>

      

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto scroll-smooth pb-40 z-10">
        
        {/* Zero State / Welcome Screen */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold mb-3 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-500">
              How can I help you today?
            </h2>
            <p className="text-zinc-400 mb-10 text-center max-w-md">
              Ask anything about your ingested institutional data. I'll search the local vector database and provide cited answers.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
              {suggestions.map((text, i) => (
                <button 
                  key={i}
                  onClick={() => handleSendMessage(null, text)}
                  className="text-left p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all group flex flex-col gap-2"
                >
                  <span className="text-sm text-zinc-300 group-hover:text-indigo-400 transition-colors">{text}</span>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Feed (Centered Layout) */}
        <div className="max-w-3xl mx-auto space-y-8 pt-10 px-4">
          {messages.map((msg) => (
            <div key={msg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {msg.role === 'user' ? (
                // User Message
                <div className="flex items-center justify-end gap-4 mb-2">
                  <div className="bg-zinc-800 text-zinc-100 px-5 py-3.5 rounded-2xl max-w-[85%] text-base shadow-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                // AI Message
                <div className="flex gap-5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 border shadow-sm ${
                    msg.isError 
                      ? 'bg-red-950/50 border-red-900/50 text-red-400' 
                      : 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/20'
                  }`}>
                    <Bot className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className={`text-base leading-relaxed ${msg.isError ? 'text-red-400' : 'text-zinc-200'}`}>
                      {msg.text}
                    </div>

                    {/* Highly Polished Source Citations */}
                    {!msg.isError && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-zinc-800/50">
                        <div className="flex items-center gap-2 mb-3">
                          <TerminalSquare className="w-4 h-4 text-zinc-500" />
                          <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Retrieved Context</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((source, idx) => (
                            <div 
                              key={idx}
                              className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 border border-zinc-800 hover:border-indigo-500/50 rounded-lg cursor-pointer transition-colors group/source"
                            >
                              <div className="w-6 h-6 rounded bg-indigo-500/10 flex items-center justify-center">
                                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-zinc-300 truncate max-w-[150px] group-hover/source:text-indigo-300 transition-colors">
                                  {source.name}
                                </span>
                                {source.page !== "N/A" && (
                                  <span className="text-[10px] text-zinc-500">Page {source.page}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Glowing Typing Indicator */}
          {isTyping && (
             <div className="flex gap-5 animate-in fade-in duration-300">
               <div className="w-8 h-8 rounded-lg bg-indigo-600 border border-indigo-500 text-white flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-indigo-500/20">
                 <Bot className="w-5 h-5" />
               </div>
               <div className="flex-1 py-1.5 flex items-center gap-3">
                 <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                 <span className="text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 animate-pulse">
                   Querying local vectors...
                 </span>
               </div>
             </div>
          )}
          
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Floating Input Island */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C]/90 to-transparent pt-20 pb-8 px-4 z-20 pointer-events-none">
        <div className="max-w-3xl mx-auto relative group pointer-events-auto">
          {/* Animated Glow Behind Input */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          
          <form onSubmit={(e) => handleSendMessage(e)} className="relative flex items-center bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl">
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message Contexta..."
              className="w-full bg-transparent text-zinc-100 placeholder:text-zinc-500 pl-6 pr-14 py-4 focus:outline-none text-base"
              disabled={isTyping}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!inputValue.trim() || isTyping}
              className="absolute right-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 w-10 transition-all active:scale-95 disabled:opacity-30 disabled:hover:bg-indigo-600"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </form>
          <div className="text-center mt-3 text-[11px] text-zinc-500 font-medium tracking-wide">
            Contexta AI processes data entirely locally. Confidentiality guaranteed.
          </div>
        </div>
      </div>

    </div>
  );
};

export default ChatPage;