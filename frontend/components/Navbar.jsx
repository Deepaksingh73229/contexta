'use client'

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BrainCircuit } from 'lucide-react';
import { ThemeToggle } from "@/components/theme-toggle";

export default function Navbar() {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/75 dark:bg-zinc-950/75 backdrop-blur supports-backdrop-filter:bg-white/60">
            <div className="container mx-auto px-20 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <BrainCircuit className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xl font-bold tracking-tight">Contexta</span>
                </Link>

                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    <Link href="/ingest" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Upload Doc</Link>
                    <Link href="/chat" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Search Doc</Link>
                </nav>

                <div className="flex items-center gap-4">
                    {/* Placeholder for theme toggle button */}
                    <ThemeToggle/>

                    <span className="text-neutral-600 italic font-mono text-xs">Coming Soon</span>
                    
                </div>
            </div>
        </header>
    );
};