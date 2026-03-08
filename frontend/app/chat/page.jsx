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
  ExternalLink,
} from 'lucide-react';

import { querySearch } from '@/services/operations/chatAPI';

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {'user' | 'ai'} MessageRole
 *
 * @typedef {Object} Source
 * @property {string}        name    — original filename e.g. "report.pdf"
 * @property {number|string} page    — 1-indexed page number or "N/A"
 * @property {string|null}   doc_id  — uuid hex from upload.py; null if absent
 *
 * @typedef {Object} Message
 * @property {string}      id
 * @property {MessageRole} role
 * @property {string}      text
 * @property {Source[]}    [sources]
 * @property {boolean}     [isError]
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'How many students passed out in the 2016 batch?',
  'What is the protocol for visitor hours?',
  'List the top placement packages recorded.',
  'Summarize the faculty leave policy.',
];

const ATTACH_ITEMS = [
  { icon: Paperclip, label: 'Upload file' },
  { icon: ImageIcon, label: 'Add image' },
  { icon: FileCode, label: 'Import code' },
];

/** Collision-proof unique ID. @returns {string} */
const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Build the citation URL for a source.
 * Returns null when doc_id is absent so the chip degrades gracefully.
 * @param {Source} source
 * @returns {string|null}
 */
const buildCitationUrl = (source) => {
  if (!source.doc_id) return null;
  const base = `/api/cite/${source.doc_id}`;
  return typeof source.page === 'number' ? `${base}#page=${source.page}` : base;
};

// ─── SourceChip ───────────────────────────────────────────────────────────────

/**
 * Linked variant  — <a> when doc_id present; opens PDF in new tab at cited page.
 * Static variant  — plain <div> when doc_id absent; never breaks older docs.
 * @param {{ source: Source }} props
 */
const SourceChip = ({ source }) => {
  const href = buildCitationUrl(source);
  const isLinked = href !== null;

  const pageLabel =
    typeof source.page === 'number' ? `p. ${source.page}`
      : source.page !== 'N/A' ? `p. ${source.page}`
        : null;

  const inner = (
    <>
      <div
        className="w-6 h-6 rounded bg-violet-500/10 dark:bg-violet-500/10 flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        <FileText className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
      </div>

      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[150px] group-hover/chip:text-violet-600 dark:group-hover/chip:text-violet-400 transition-colors">
          {source.name}
        </span>
        {pageLabel && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-600">{pageLabel}</span>
        )}
      </div>

      {isLinked && (
        <ExternalLink
          className="w-3 h-3 text-neutral-400 dark:text-neutral-600 group-hover/chip:text-violet-500 dark:group-hover/chip:text-violet-400 transition-colors shrink-0 ml-0.5"
          aria-hidden="true"
        />
      )}
    </>
  );

  const cls = [
    'flex items-center gap-2 px-3 py-2 rounded-lg',
    'bg-neutral-100 dark:bg-neutral-900/80',
    'border border-neutral-200 dark:border-neutral-800',
    'transition-colors duration-150 group/chip',
    isLinked
      ? 'hover:border-violet-400/60 dark:hover:border-violet-600/60 hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer'
      : 'cursor-default',
  ].join(' ');

  if (isLinked) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${source.name}${pageLabel ? `, ${pageLabel}` : ''} — opens PDF in new tab`}
        className={cls}
      >
        {inner}
      </a>
    );
  }

  return (
    <div role="listitem" className={cls}>
      {inner}
    </div>
  );
};

// ─── RayBackground ────────────────────────────────────────────────────────────

/**
 * Decorative radial-ray background.
 * Adapts glow colour to theme: purple-tinted in dark, soft violet in light.
 * aria-hidden — skipped by assistive technology.
 */
function RayBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none"
    >
      {/* Base fill — neutral-950 dark / neutral-50 light */}
      <div className="absolute inset-0 bg-neutral-50 dark:bg-neutral-950" />

      {/* Radial glow cone — FIXED: was invalid `radial-linear(...)` */}
      {/* Dark: deep violet glow · Light: soft lavender tint           */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-[4000px] h-[1800px] sm:w-[6000px]"
        style={{
          background: [
            'radial-linear(circle at center 800px,',
            '  rgba(124,58,237,0.22)  0%,',   /* violet-600 */
            '  rgba(124,58,237,0.10) 14%,',
            '  rgba(124,58,237,0.05) 20%,',
            '  rgba(124,58,237,0.01) 25%)',
          ].join(''),
        }}
      />

      {/* Concentric ring stack — exact px margins (Tailwind v3 has no 3.25/2.75) */}
      <div
        className="absolute top-[175px] left-1/2 w-[1600px] h-[1600px] sm:top-1/2 sm:w-[3043px] sm:h-[2865px]"
        style={{ transform: 'translate(-50%) rotate(180deg)' }}
      >
        {/* Each ring: dark mode uses dark neutral fill; light mode is transparent so the light base shows */}
        <div className="absolute w-full h-full rounded-full dark:bg-neutral-950 bg-neutral-50"
          style={{ marginTop: '-13px', background: undefined, border: '16px solid white', transform: 'rotate(180deg)', zIndex: 5 }} />
        <div className="absolute w-full h-full rounded-full dark:bg-neutral-950 bg-neutral-50"
          style={{ marginTop: '-11px', border: '23px solid rgba(196,181,253,0.35)', transform: 'rotate(180deg)', zIndex: 4 }} />
        <div className="absolute w-full h-full rounded-full dark:bg-neutral-950 bg-neutral-50"
          style={{ marginTop: '-8px', border: '23px solid rgba(167,139,250,0.45)', transform: 'rotate(180deg)', zIndex: 3 }} />
        <div className="absolute w-full h-full rounded-full dark:bg-neutral-950 bg-neutral-50"
          style={{ marginTop: '-4px', border: '23px solid rgba(139,92,246,0.55)', transform: 'rotate(180deg)', zIndex: 2 }} />
        <div className="absolute w-full h-full rounded-full dark:bg-neutral-950 bg-neutral-50"
          style={{ border: '20px solid rgba(109,40,217,0.80)', boxShadow: '0 -15px 24.8px rgba(109,40,217,0.45)', transform: 'rotate(180deg)', zIndex: 1 }} />
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

  const [inputValue, setInputValue] = useState('');
  const inputValueRef = useRef('');

  const handleInputChange = (e) => {
    inputValueRef.current = e.target.value;
    setInputValue(e.target.value);
  };

  const messagesEndRef = useRef(/** @type {HTMLDivElement|null}      */(null));
  const textareaRef = useRef(/** @type {HTMLTextAreaElement|null} */(null));
  const attachMenuRef = useRef(/** @type {HTMLDivElement|null}      */(null));

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [inputValue]);

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

    inputValueRef.current = '';
    setInputValue('');
    setShowAttachMenu(false);
    setIsTyping(true);

    const userMsg = { id: uid(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();

    try {
      const responseData = await querySearch(text, { signal: controller.signal });
      if (!isMountedRef.current) return;

      const aiMsg = {
        id: uid(),
        role: 'ai',
        text: responseData.answer,
        sources: responseData.sources ?? [],
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (!isMountedRef.current) return;

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const textareaId = useId();
  const attachMenuId = useId();
  const statusRegionId = useId();
  const isEmpty = messages.length === 0;

  return (
    // Root: neutral-50 light / neutral-950 dark
    <div className="flex flex-col h-[calc(100vh-65px)] bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans relative overflow-hidden">
      <RayBackground />

      {/* ── Scrollable chat area ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scroll-smooth pb-44 z-10">

        {/* Welcome / zero state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center min-h-[80%] px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center mb-8">
              <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-white tracking-tight mb-2">
                How can I{' '}
                {/* Purple linear — works in both themes */}
                <span className="bg-linear-to-b from-violet-400 via-violet-500 to-purple-700 bg-clip-text text-transparent italic">
                  help
                </span>
                {' '}you today?
              </h2>
              <p className="text-base sm:text-lg font-semibold text-neutral-500 dark:text-neutral-400">
                Ask anything about your ingested institutional data. I&apos;ll search the local vector database and provide cited answers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  onClick={() => handleSendMessage(text)}
                  className="
                    text-left p-4 rounded-xl
                    border border-neutral-200 dark:border-neutral-800
                    bg-white/60 dark:bg-neutral-900/50
                    hover:bg-violet-50 dark:hover:bg-violet-950/30
                    hover:border-violet-300 dark:hover:border-violet-800
                    transition-all group flex flex-col gap-2
                  "
                >
                  <span className="text-sm text-neutral-600 dark:text-neutral-400 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
                    {text}
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 dark:text-neutral-600 group-hover:text-violet-500 dark:group-hover:text-violet-500 transition-colors" />
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
                  {/* User bubble — neutral in light, dark in dark */}
                  <div className="
                    bg-neutral-100 dark:bg-neutral-800
                    border border-neutral-200 dark:border-neutral-700
                    text-neutral-900 dark:text-neutral-100
                    px-5 py-3.5 rounded-2xl max-w-[85%] text-base shadow-sm
                  ">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="flex gap-5">
                  {/* AI avatar — purple in both themes */}
                  <div
                    aria-hidden="true"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 border ${msg.isError
                        ? 'bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-900/50 text-red-500 dark:text-red-400'
                        : 'bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700/50 text-violet-600 dark:text-violet-400 shadow-[0_0_16px_rgba(124,58,237,0.15)] dark:shadow-[0_0_16px_rgba(124,58,237,0.2)]'
                      }`}
                  >
                    <Bot className="w-5 h-5" />
                  </div>

                  <div className="flex-1 space-y-4">
                    <p className={`text-base leading-relaxed ${msg.isError
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-neutral-800 dark:text-neutral-200'
                      }`}>
                      {msg.text}
                    </p>

                    {/* Source citations */}
                    {!msg.isError && (msg.sources?.length ?? 0) > 0 && (
                      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                        <div className="flex items-center gap-2 mb-3" aria-hidden="true">
                          <TerminalSquare className="w-4 h-4 text-neutral-400 dark:text-neutral-600" />
                          <span className="text-xs font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-widest">
                            Retrieved Context
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2" role="list" aria-label="Source documents">
                          {msg.sources.map((source, idx) => (
                            <SourceChip key={`${source.name}-${idx}`} source={source} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
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
                  className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-violet-200 dark:shadow-violet-900/30"
                >
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1 py-1.5 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-violet-500 dark:text-violet-400 animate-spin" aria-hidden="true" />
                  {/* FIXED: bg-linear-to-r → bg-linear-to-r */}
                  <span className="text-sm font-medium text-transparent bg-clip-text bg-linear-to-r from-violet-500 to-purple-600 dark:from-violet-400 dark:to-purple-400 animate-pulse">
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
      {/* FIXED: bg-linear-to-t → bg-linear-to-t; neutral fade per theme   */}
      <div className="absolute bottom-0 w-full bg-linear-to-t from-neutral-50 dark:from-neutral-950 via-neutral-50/90 dark:via-neutral-950/90 to-transparent pt-20 pb-8 px-4 z-20 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto">

          <div className="relative w-full">
            {/* FIXED: bg-linear-to-b from-white/8 → bg-linear-to-b from-white/[0.08] */}
            <div className="absolute -inset-px rounded-2xl bg-linear-to-b from-violet-300/20 dark:from-violet-500/10 to-transparent pointer-events-none" />

            {/* Input card */}
            <div className="
              relative rounded-2xl
              bg-white dark:bg-neutral-900
              ring-1 ring-neutral-200 dark:ring-neutral-800
              shadow-lg shadow-neutral-200/60 dark:shadow-black/40
            ">
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
                className="
                  w-full resize-none bg-transparent
                  text-[15px] text-neutral-900 dark:text-white
                  placeholder-neutral-400 dark:placeholder-neutral-600
                  px-5 pt-5 pb-3 focus:outline-none
                  min-h-[80px] max-h-[200px] disabled:opacity-50
                "
              />

              <div className="flex items-center justify-between px-3 pb-3 pt-1">

                {/* Attach button + menu */}
                <div className="flex items-center gap-1">
                  <div ref={attachMenuRef} className="relative">
                    <button
                      type="button"
                      aria-label="Attach file"
                      aria-expanded={showAttachMenu}
                      aria-controls={attachMenuId}
                      onClick={() => setShowAttachMenu((v) => !v)}
                      className="
                        flex items-center justify-center size-8 rounded-full
                        bg-neutral-100 dark:bg-neutral-800
                        hover:bg-violet-100 dark:hover:bg-violet-950/50
                        text-neutral-500 dark:text-neutral-500
                        hover:text-violet-600 dark:hover:text-violet-400
                        transition-all duration-200 active:scale-95
                      "
                    >
                      <Plus
                        className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {showAttachMenu && (
                      <div
                        id={attachMenuId}
                        role="menu"
                        aria-label="Attach options"
                        className="
                          absolute bottom-full left-0 mb-2 z-50
                          bg-white dark:bg-neutral-900
                          backdrop-blur-xl
                          border border-neutral-200 dark:border-neutral-800
                          rounded-xl shadow-xl shadow-neutral-200/60 dark:shadow-black/50
                          overflow-hidden
                          animate-in fade-in slide-in-from-bottom-2 duration-200
                        "
                      >
                        <div className="p-1.5 min-w-[180px]">
                          {ATTACH_ITEMS.map(({ icon: Icon, label }) => (
                            <button
                              key={label}
                              type="button"
                              role="menuitem"
                              aria-disabled="true"
                              title={`${label} — coming soon`}
                              className="
                                w-full flex items-center gap-3 px-3 py-2 rounded-lg
                                text-neutral-400 dark:text-neutral-500
                                hover:bg-neutral-100 dark:hover:bg-neutral-800
                                hover:text-neutral-700 dark:hover:text-neutral-300
                                transition-all duration-150 cursor-not-allowed opacity-60
                              "
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
                  <button
                    type="button"
                    aria-disabled="true"
                    title="Suggest — coming soon"
                    className="
                      flex items-center gap-1.5 px-3 py-2 rounded-full
                      text-xs font-medium
                      text-neutral-400 dark:text-neutral-600
                      hover:text-neutral-700 dark:hover:text-neutral-300
                      hover:bg-neutral-100 dark:hover:bg-neutral-800
                      transition-all duration-200 cursor-not-allowed opacity-60
                    "
                  >
                    <Lightbulb className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Suggest</span>
                  </button>

                  {/* Send — purple accent in both themes */}
                  <button
                    type="button"
                    aria-label="Send message"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isTyping}
                    className="
                      flex items-center gap-2 px-4 py-2 rounded-full
                      text-sm font-medium text-white
                      bg-violet-600 hover:bg-violet-500
                      dark:bg-violet-600 dark:hover:bg-violet-500
                      disabled:opacity-40 disabled:cursor-not-allowed
                      active:scale-95 transition-all duration-200
                      shadow-[0_0_20px_rgba(124,58,237,0.35)]
                    "
                  >
                    <span className="hidden sm:inline">Ask</span>
                    <SendHorizontal className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center mt-3 text-[11px] text-neutral-400 dark:text-neutral-600 font-medium tracking-wide">
            Contexta AI processes data entirely locally. Confidentiality guaranteed.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;