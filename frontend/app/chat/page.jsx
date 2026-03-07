'use client'

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
} from 'react';

import {
  Bot,
  FileText,
  Loader2,
  ArrowRight,
  Plus,
  Paperclip,
  Image as ImageIcon,
  FileCode,
  Lightbulb,
  SendHorizontal,
  TerminalSquare,
} from 'lucide-react';

import { querySearch } from '@/services/operations/chatAPI';

const SUGGESTIONS = [
  'How many students passed out in the 2016 batch?',
  'What is the protocol for visitor hours?',
  'List the top placement packages recorded.',
  'Summarize the faculty leave policy.',
];

/** Attach-menu items. Actions are stubs until the feature is wired up. */
const ATTACH_ITEMS = [
  { icon: Paperclip, label: 'Upload file' },
  { icon: ImageIcon, label: 'Add image' },
  { icon: FileCode, label: 'Import code' },
];

/**
 * Collision-proof unique ID using the Web Crypto API.
 * Falls back to Math.random() in environments where crypto is unavailable.
 * @returns {string}
 */
const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// ─── RayBackground ────────────────────────────────────────────────────────────

/**
 * Purely decorative animated background.
 * Marked aria-hidden so assistive technology skips it entirely.
 */
function RayBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none"
    >
      {/* Base fill */}
      <div className="absolute inset-0 bg-[#0f0f0f]" />

      {/* Radial glow cone */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[4000px] h-[1800px] sm:w-[6000px]"
        style={{
          background: [
            'radial-linear(circle at center 800px,',
            '  rgba(20,136,252,0.80)  0%,',
            '  rgba(20,136,252,0.35) 14%,',
            '  rgba(20,136,252,0.18) 18%,',
            '  rgba(20,136,252,0.08) 22%,',
            '  rgba(17,17,20,0.20)   25%)',
          ].join(''),
        }}
      />

      {/* Concentric ring stack — decorative light effect */}
      <div
        className="absolute top-[175px] left-1/2 w-[1600px] h-[1600px] sm:top-1/2 sm:w-[3043px] sm:h-[2865px]"
        style={{ transform: 'translate(-50%) rotate(180deg)' }}
      >
        <div className="absolute w-full h-full rounded-full -mt-3.25" style={{ background: 'radial-linear(43.89% 25.74% at 50.02% 97.24%, #111114 0%, #0f0f0f 100%)', border: '16px solid white', transform: 'rotate(180deg)', zIndex: 5 }} />
        <div className="absolute w-full h-full rounded-full bg-[#0f0f0f] -mt-2.75" style={{ border: '23px solid #b7d7f6', transform: 'rotate(180deg)', zIndex: 4 }} />
        <div className="absolute w-full h-full rounded-full bg-[#0f0f0f] -mt-2" style={{ border: '23px solid #8fc1f2', transform: 'rotate(180deg)', zIndex: 3 }} />
        <div className="absolute w-full h-full rounded-full bg-[#0f0f0f] -mt-1" style={{ border: '23px solid #64acf6', transform: 'rotate(180deg)', zIndex: 2 }} />
        <div className="absolute w-full h-full rounded-full bg-[#0f0f0f]" style={{ border: '20px solid #1172e2', boxShadow: '0 -15px 24.8px rgba(17,114,226,0.6)', transform: 'rotate(180deg)', zIndex: 1 }} />
      </div>
    </div>
  );
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

const ChatPage = () => {
  /** @type {[Message[], React.Dispatch<React.SetStateAction<Message[]>>]} */
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Keep inputValue in both state (for controlled textarea) and a ref
  // (so handleSendMessage never reads a stale closure value — FIX #2).
  const [inputValue, setInputValue] = useState('');
  const inputValueRef = useRef('');

  const handleInputChange = (e) => {
    inputValueRef.current = e.target.value;
    setInputValue(e.target.value);
  };

  const messagesEndRef = useRef(/** @type {HTMLDivElement|null} */(null));
  const textareaRef = useRef(/** @type {HTMLTextAreaElement|null} */(null));
  const attachMenuRef = useRef(/** @type {HTMLDivElement|null} */(null));

  // FIX #4 — guard all setState calls behind a mount flag to prevent
  // "setState on unmounted component" leaks when the user navigates away.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  // FIX #6 — the competing inline style={{ height: '80px' }} is removed.
  // CSS min-height holds the baseline; this effect grows the textarea.

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [inputValue]);

  // ── Attach-menu outside-click ──────────────────────────────────────────────
  // FIX #3 — replaced global pointer-blocking overlay div with a proper
  // document-level listener scoped to the menu's ref container.
  // This preserves full keyboard/focus accessibility.

  useEffect(() => {
    if (!showAttachMenu) return;

    const handleOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('focusin', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('focusin', handleOutside);
    };
  }, [showAttachMenu]);

  const handleSendMessage = useCallback(async (suggestedText = null) => {
    const text = (suggestedText ?? inputValueRef.current).trim();
    if (!text || isTyping) return;

    // Reset input immediately so the textarea shrinks back.
    inputValueRef.current = '';
    setInputValue('');
    setShowAttachMenu(false); // FIX #11

    setIsTyping(true);

    /** @type {Message} */
    const userMsg = { id: uid(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();

    try {
      const responseData = await querySearch(text, { signal: controller.signal });

      if (!isMountedRef.current) return;

      /** @type {Message} */
      const aiMsg = {
        id: uid(),
        role: 'ai',
        text: responseData.answer,
        sources: responseData.sources ?? [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      // Intentional abort (e.g. component unmounted) — do not show an error.
      if (err?.name === 'AbortError') return;
      if (!isMountedRef.current) return;

      /** @type {Message} */
      const errorMsg = {
        id: uid(),
        role: 'ai',
        isError: true,
        text: 'Connection error. Ensure the local Contexta backend is running via FastAPI and documents are ingested.',
        sources: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (isMountedRef.current) setIsTyping(false);
    }
  }, [isTyping]);

  // FIX #10 — clean, unambiguous keyboard handler; no argument mis-match.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Accessibility IDs ──────────────────────────────────────────────────────
  // useId() produces stable, SSR-safe IDs that survive hydration.
  const textareaId = useId();
  const attachMenuId = useId();
  const statusRegionId = useId();

  const isEmpty = messages.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-[#0f0f0f] text-zinc-100 font-sans relative overflow-hidden">
      <RayBackground />

      {/* ── Scrollable chat area ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scroll-smooth pb-44 z-10">

        {/* Welcome / zero state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center min-h-[80%] px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center mb-8">
              <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-2">
                How can I{' '}
                <span className="bg-linear-to-b from-[#4da5fc] via-[#4da5fc] to-white bg-clip-text text-transparent italic">
                  help
                </span>
                {' '}you today?
              </h2>
              <p className="text-base sm:text-lg font-semibold text-[#8a8a8f] ">
                Ask anything about your ingested institutional data. I&apos;ll search the local vector database and provide cited answers.
              </p>
            </div>

            {/* FIX #9 — stable string keys instead of array index */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  onClick={() => handleSendMessage(text)}
                  className="text-left p-4 rounded-xl border border-white/10 bg-[#1e1e22]/50 hover:bg-[#1e1e22] hover:border-white/20 transition-all group flex flex-col gap-2"
                >
                  <span className="text-sm text-[#a0a0a5] group-hover:text-[#4da5fc] transition-colors">{text}</span>
                  <ArrowRight className="w-4 h-4 text-[#5a5a5f] group-hover:text-[#1488fc] transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message feed */}
        <div className="max-w-3xl mx-auto space-y-8 pt-10 px-4">
          {messages.map((msg) => (
            <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">

              {msg.role === 'user' ? (
                <div className="flex items-center justify-end">
                  <div className="bg-[#1e1e22] border border-white/10 text-zinc-100 px-5 py-3.5 rounded-2xl max-w-[85%] text-base shadow-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="flex gap-5">
                  <div
                    aria-hidden="true"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 border ${msg.isError
                      ? 'bg-red-950/50 border-red-900/50 text-red-400'
                      : 'bg-[#1488fc]/20 border-[#1488fc]/30 text-[#4da5fc] shadow-[0_0_16px_rgba(20,136,252,0.2)]'
                      }`}
                  >
                    <Bot className="w-5 h-5" />
                  </div>

                  <div className="flex-1 space-y-4">
                    <p className={`text-base leading-relaxed ${msg.isError ? 'text-red-400' : 'text-zinc-200'}`}>
                      {msg.text}
                    </p>

                    {/* Source citations */}
                    {!msg.isError && (msg.sources?.length ?? 0) > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/6">
                        <div className="flex items-center gap-2 mb-3" aria-hidden="true">
                          <TerminalSquare className="w-4 h-4 text-[#5a5a5f]" />
                          <span className="text-xs font-medium text-[#5a5a5f] uppercase tracking-widest">Retrieved Context</span>
                        </div>

                        {/* FIX #9 — composite key; FIX #8 — list role */}
                        <div className="flex flex-wrap gap-2" role="list" aria-label="Source documents">
                          {msg.sources.map((source, idx) => (
                            <div
                              key={`${source.name}-${idx}`}
                              role="listitem"
                              className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1e]/80 border border-white/10 hover:border-[#1488fc]/50 rounded-lg cursor-default transition-colors group/source"
                            >
                              <div className="w-6 h-6 rounded bg-[#1488fc]/10 flex items-center justify-center" aria-hidden="true">
                                <FileText className="w-3.5 h-3.5 text-[#4da5fc]" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-zinc-300 truncate max-w-[150px] group-hover/source:text-[#4da5fc] transition-colors">
                                  {source.name}
                                </span>
                                {source.page !== 'N/A' && (
                                  <span className="text-[10px] text-[#6a6a6f]">Page {source.page}</span>
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

          {/* FIX #8 — aria-live region announces typing state to screen readers */}
          <div
            id={statusRegionId}
            role="status"
            aria-live="polite"
            aria-label={isTyping ? 'Contexta is thinking' : undefined}
          >
            {isTyping && (
              <div className="flex gap-5 animate-in fade-in duration-300">
                <div
                  aria-hidden="true"
                  className="w-8 h-8 rounded-lg bg-[#1488fc]/20 border border-[#1488fc]/30 text-[#4da5fc] flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-[#1488fc]/10"
                >
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1 py-1.5 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-[#1488fc] animate-spin" aria-hidden="true" />
                  <span className="text-sm font-medium text-transparent bg-clip-text bg-linear-to-r from-[#4da5fc] to-[#a78bfa] animate-pulse">
                    Querying local vectors...
                  </span>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* ── Floating input island ──────────────────────────────────────────── */}
      <div className="absolute bottom-0 w-full bg-linear-to-t from-[#0f0f0f] via-[#0f0f0f]/90 to-transparent pt-20 pb-8 px-4 z-20 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto">

          <div className="relative w-full">
            {/* linear-border shimmer */}
            <div className="absolute -inset-px rounded-2xl bg-linear-to-b from-white/8 to-transparent pointer-events-none" />

            <div className="relative rounded-2xl bg-[#1e1e22] ring-1 ring-white/8 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_2px_20px_rgba(0,0,0,0.4)]">

              {/* FIX #6 — inline height removed; min-h class drives baseline */}
              {/* FIX #8 — aria-label + aria-describedby wired up           */}
              <textarea
                ref={textareaRef}
                id={textareaId}
                aria-label="Message Contexta"
                aria-describedby={statusRegionId}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message Contexta..."
                disabled={isTyping}
                rows={1}
                className="w-full resize-none bg-transparent text-[15px] text-white placeholder-[#5a5a5f] px-5 pt-5 pb-3 focus:outline-none min-h-[80px] max-h-[200px] disabled:opacity-50"
              />

              <div className="flex items-center justify-between px-3 pb-3 pt-1">

                {/* Attach button + menu */}
                <div className="flex items-center gap-1">
                  {/* FIX #3 — ref-scoped outside-click; no global overlay */}
                  <div ref={attachMenuRef} className="relative">
                    <button
                      type="button"
                      aria-label="Attach file"
                      aria-expanded={showAttachMenu}
                      aria-controls={attachMenuId}
                      onClick={() => setShowAttachMenu((v) => !v)}
                      className="flex items-center justify-center size-8 rounded-full bg-white/8 hover:bg-white/12 text-[#8a8a8f] hover:text-white transition-all duration-200 active:scale-95"
                    >
                      <Plus
                        className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {/* FIX #7 — aria-disabled + tooltip on stub items */}
                    {showAttachMenu && (
                      <div
                        id={attachMenuId}
                        role="menu"
                        aria-label="Attach options"
                        className="absolute bottom-full left-0 mb-2 z-50 bg-[#1a1a1e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
                      >
                        <div className="p-1.5 min-w-45">
                          {ATTACH_ITEMS.map(({ icon: Icon, label }) => (
                            <button
                              key={label}
                              type="button"
                              role="menuitem"
                              aria-disabled="true"
                              title={`${label} — coming soon`}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#a0a0a5] hover:bg-white/5 hover:text-white transition-all duration-150 cursor-not-allowed opacity-60"
                            >
                              <Icon className="size-4" aria-hidden="true" />
                              <span className="text-sm">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suggest + Send */}
                <div className="flex items-center gap-2">
                  {/* Stub button — marked non-interactive until wired up */}
                  <button
                    type="button"
                    aria-disabled="true"
                    title="Suggest — coming soon"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium text-[#6a6a6f] hover:text-white hover:bg-white/5 transition-all duration-200 cursor-not-allowed opacity-60"
                  >
                    <Lightbulb className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Suggest</span>
                  </button>

                  {/* FIX #8 — aria-label for icon-only mobile view */}
                  <button
                    type="button"
                    aria-label="Send message"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-[#1488fc] hover:bg-[#1a94ff] text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-[0_0_20px_rgba(20,136,252,0.3)]"
                  >
                    <span className="hidden sm:inline">Ask</span>
                    <SendHorizontal className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center mt-3 text-[11px] text-[#5a5a5f] font-medium tracking-wide">
            Contexta AI processes data entirely locally. Confidentiality guaranteed.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;