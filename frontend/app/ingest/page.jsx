'use client'

import React, { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { ingestDoc } from "@/services/operations/ingestAPI";
import { Progress } from "@/components/ui/progress";
import uploadImg from "@/public/upload.svg";
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle,
  Loader2,
  ShieldCheck,
  Database,
  AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {'pending' | 'completed' | 'error'} FileStatus
 *
 * @typedef {Object} QueuedFile
 * @property {File}       file
 * @property {string}     id
 * @property {FileStatus} status
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single file row in the processing queue */
const FileRow = ({ item, isProcessing, onRemove }) => {
  const statusIcon = {
    completed: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    pending: !isProcessing && (
      <button
        aria-label={`Remove ${item.file.name}`}
        onClick={() => onRemove(item.id)}
        className="text-neutral-600 hover:text-red-400 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    ),
  }[item.status];

  const rowAccent = {
    completed: 'border-l-emerald-500',
    error: 'border-l-red-500',
    pending: 'border-l-neutral-700',
  }[item.status];

  return (
    <li
      className={`
        flex items-center gap-3 px-4 py-3
        bg-neutral-900 border border-neutral-800 border-l-2 ${rowAccent}
        rounded-sm transition-colors duration-200
      `}
    >
      {/* Icon */}
      <span className="w-8 h-8 flex items-center justify-center bg-neutral-800 rounded-sm shrink-0">
        <FileText className="w-4 h-4 text-neutral-400" />
      </span>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-100 truncate leading-tight">
          {item.file.name}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5 font-mono">
          {formatBytes(item.file.size)}
        </p>
      </div>

      {/* Status */}
      <span className="shrink-0">{statusIcon}</span>
    </li>
  );
};

/** Progress / status banner shown while ingestion runs */
const IngestionProgress = ({ statusText, progress }) => (
  <div
    role="status"
    aria-live="polite"
    className="border border-indigo-900/60 bg-indigo-950/40 rounded-sm px-4 py-3 space-y-2.5"
  >
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="flex items-center gap-2 text-indigo-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {statusText}
      </span>
      <span className="text-indigo-400 tabular-nums">{Math.round(progress)}%</span>
    </div>
    <Progress
      value={progress}
      className="h-1 bg-indigo-950"
    />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const UploadPage = () => {
  /** @type {[QueuedFile[], Function]} */
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  // ── File management ──────────────────────────────────────────────────────

  const enqueueFiles = useCallback((rawFiles) => {
    /** @type {QueuedFile[]} */
    const newItems = rawFiles
      .filter((f) => f.type === 'application/pdf')
      .map((f) => ({ file: f, id: uid(), status: 'pending' }));
    setFiles((prev) => [...prev, ...newItems]);
  }, []);

  const handleInputChange = (e) => {
    enqueueFiles(Array.from(e.target.files ?? []));
    // Reset input so the same file can be re-added after removal
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemove = useCallback((id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── Drag-and-drop ────────────────────────────────────────────────────────

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    // Only fire when leaving the drop zone itself, not its children
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    enqueueFiles(Array.from(e.dataTransfer.files));
  };

  // ── Ingestion ────────────────────────────────────────────────────────────

  const handleProcessFiles = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setIsProcessing(true);
    setProgress(0);

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const { name } = item.file;

      try {
        setStatusText(`Uploading & chunking ${name}…`);
        setProgress(((i / pending.length) + 0.1 / pending.length) * 100);

        const formData = new FormData();
        formData.append('file', item.file);

        setStatusText(`Generating vectors for ${name}…`);
        setProgress(((i / pending.length) + 0.5 / pending.length) * 100);

        await ingestDoc(formData);

        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'completed' } : f))
        );
        setProgress(((i + 1) / pending.length) * 100);
      } catch (err) {
        console.error(`Ingestion failed for "${name}":`, err);
        setStatusText(`Error processing ${name}`);
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'error' } : f))
        );
      }
    }

    setStatusText('Ingestion complete!');
    setProgress(100);
    setTimeout(() => setIsProcessing(false), 1500);
  };

  // ── Derived state ────────────────────────────────────────────────────────

  const hasPending = files.some((f) => f.status === 'pending');

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Subtle grid background ── */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(#a1a1aa 1px, transparent 1px), linear-gradient(90deg, #a1a1aa 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 flex flex-col gap-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-3">
          <h1 className="text-5xl md:text-6xl font-extrabold">
            Data <span className="text-purple-400/60">Ingestion</span>
          </h1>
          
          <p className="text-neutral-400 text-sm leading-relaxed">
            Upload institutional records, guidelines, and reports to train your local knowledge base.
          </p>
        </header>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8 items-start">

          {/* Left — illustration + trust badge */}
          <aside className="flex flex-col gap-6">
            <div className="rounded-sm overflow-hidden bg-neutral-900 border border-neutral-800 p-8 flex items-center justify-center">
              <Image
                alt="Upload illustration"
                src={uploadImg}
                className="w-full max-w-xs opacity-90"
              />
            </div>

            <div className="flex items-start gap-3 border border-purple-800/20 rounded-sm px-4 py-3 bg-neutral-100 dark:bg-neutral-900/60">
              <ShieldCheck className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-purple-500 tracking-wide">
                  100% Local Processing
                </p>
                <p className="text-xs text-neutral-700 dark:text-neutral-500 mt-0.5 leading-relaxed">
                  Documents never leave your infrastructure. All vectorisation happens on-device.
                </p>
              </div>
            </div>
          </aside>

          {/* Right — upload card */}
          <section className="space-y-6">
            {/* Header row */}
            <div className="flex items-baseline justify-between border-b border-neutral-800 pb-4">
              <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 tracking-tight">
                Upload Documents
              </h2>
              <span className="text-xs text-neutral-600 dark:text-neutral-200 font-mono">PDF · max 50 MB</span>
            </div>

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop files here or click to browse"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isProcessing && inputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && inputRef.current?.click()}
              className={`
                relative rounded-sm border-2 border-dashed px-8 py-14
                flex flex-col items-center justify-center gap-3
                cursor-pointer select-none transition-all duration-200 outline-none
                focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
                ${isDragging
                  ? 'border-indigo-500 bg-indigo-950/30 scale-[1.01]'
                  : 'border-neutral-800 bg-neutral-500/20 hover:border-neutral-600 hover:bg-neutral-500/50'}
                ${isProcessing ? 'pointer-events-none opacity-50' : ''}
              `}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf"
                onChange={handleInputChange}
                disabled={isProcessing}
                className="sr-only"
                aria-hidden="true"
              />

              <span
                className={`
                  w-14 h-14 rounded-full border flex items-center justify-center transition-colors duration-200
                  ${isDragging ? 'border-indigo-500 bg-indigo-500/20' : 'border-neutral-700 bg-neutral-800'}
                `}
              >
                <UploadCloud
                  className={`w-6 h-6 transition-colors duration-200 ${isDragging ? 'text-indigo-400' : 'text-neutral-400'}`}
                />
              </span>

              <div className="text-center">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {isDragging ? 'Release to add files' : 'Drag & drop PDFs here'}
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  or <span className="text-indigo-400 underline underline-offset-2">browse your computer</span>
                </p>
              </div>
            </div>

            {/* Queue */}
            {files.length > 0 && (
              <div className="space-y-4">
                <p className="text-xs font-mono tracking-widest text-neutral-500 uppercase flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  Processing Queue
                  <span className="ml-auto tabular-nums text-neutral-600">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                </p>

                <ul className="space-y-2">
                  {files.map((item) => (
                    <FileRow
                      key={item.id}
                      item={item}
                      isProcessing={isProcessing}
                      onRemove={handleRemove}
                    />
                  ))}
                </ul>

                {/* Progress banner */}
                {isProcessing && (
                  <IngestionProgress statusText={statusText} progress={progress} />
                )}

                {/* Ingest button */}
                {!isProcessing && hasPending && (
                  <Button
                    onClick={handleProcessFiles}
                    className="
                      w-full h-12 text-sm font-bold tracking-wide
                      bg-indigo-600 hover:bg-indigo-500 text-white
                      rounded-sm transition-colors duration-150
                      focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
                    "
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Ingest to Knowledge Base
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;