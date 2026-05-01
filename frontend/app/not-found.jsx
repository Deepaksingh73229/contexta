'use client'

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Home,
    Search,
    TerminalSquare,
    BrainCircuit,
    ArrowLeft
} from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#0A0A0C] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">

            {/* Background Ambient Effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 dark:bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse duration-[4000ms]"></div>

            {/* Grid Pattern Overlay (Optional tech-vibe) */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none -z-10"></div>

            <div className="max-w-2xl w-full text-center space-y-8 relative z-10">

                {/* Error Code Display */}
                <div className="relative inline-block mb-4">
                    <div className="absolute -inset-4 bg-indigo-500/20 dark:bg-indigo-500/10 blur-xl rounded-full"></div>
                    <h1 className="relative text-8xl md:text-9xl font-extrabold tracking-tighter text-zinc-900 dark:text-zinc-100 flex items-center justify-center gap-4">
                        4
                        <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl md:rounded-3xl shadow-2xl shadow-indigo-500/30 flex items-center justify-center animate-bounce duration-[3000ms]">
                            <BrainCircuit className="w-8 h-8 md:w-12 md:h-12 text-white" />
                        </div>
                        4
                    </h1>
                </div>

                {/* Messaging */}
                <div className="space-y-4 px-4">
                    <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900 gap-2 mb-2 px-3 py-1.5">
                        <TerminalSquare className="w-4 h-4" /> Vector Not Found
                    </Badge>
                    <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                        Lost in the Knowledge Base
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
                        The document or query path you are looking for does not exist in the current local index.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                    <Button asChild size="lg" className="w-full sm:w-auto h-14 px-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-xl transition-all">
                        <Link href="/">
                            <ArrowLeft className="w-5 h-5 mr-2" />
                            Return to Dashboard
                        </Link>
                    </Button>

                    <Button asChild variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                        <Link href="/chat">
                            <Search className="w-5 h-5 mr-2" />
                            New Query
                        </Link>
                    </Button>
                </div>

                {/* Decorative Footer info */}
                <div className="pt-16 text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                    Contexta Secure Infrastructure
                </div>

            </div>
        </div>
    );
}