'use client'

import React from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertTriangle,
    ServerCrash,
    RotateCcw,
    Home,
    TerminalSquare
} from 'lucide-react';

export default function ErrorPage({
    errorTitle = "System Disconnect",
    errorMessage = "We encountered an unexpected error while communicating with the local inference engine. Please check your connection and try again.",
    errorCode = "500",
    onRetry = () => window.location.reload()
}) {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[#0A0A0C] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">

            {/* Background Ambient Effects (Error State - Red/Orange) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/10 dark:bg-red-600/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse duration-[3000ms]"></div>

            {/* Subtle Grid Pattern Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none -z-10"></div>

            <div className="max-w-2xl w-full text-center space-y-8 relative z-10">

                {/* Error Icon / Code Display */}
                <div className="relative inline-block mb-4">
                    <div className="absolute -inset-4 bg-red-500/20 dark:bg-red-500/10 blur-xl rounded-full"></div>
                    <div className="relative w-24 h-24 md:w-32 md:h-32 mx-auto bg-gradient-to-tr from-red-600 to-orange-500 rounded-2xl md:rounded-3xl shadow-2xl shadow-red-500/30 flex items-center justify-center">
                        <ServerCrash className="w-12 h-12 md:w-16 md:h-16 text-white" />
                    </div>
                    {errorCode && (
                        <div className="absolute -bottom-4 -right-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-zinc-50 dark:border-[#0A0A0C]">
                            ERR_{errorCode}
                        </div>
                    )}
                </div>

                {/* Messaging */}
                <div className="space-y-4 px-4">
                    <Badge variant="outline" className="bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900 gap-2 mb-2 px-3 py-1.5">
                        <AlertTriangle className="w-4 h-4" /> Critical Exception
                    </Badge>
                    <h2 className="text-2xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                        {errorTitle}
                    </h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
                        {errorMessage}
                    </p>
                </div>

                {/* Technical Details (Optional - Good for Enterprise feel) */}
                <div className="max-w-sm mx-auto bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-left">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">
                        <TerminalSquare className="w-3.5 h-3.5" /> Diagnostics
                    </div>
                    <div className="font-mono text-xs text-zinc-600 dark:text-zinc-300 break-words">
                        Possible causes:<br />
                        • Vector DB connection timeout<br />
                        • Ollama service is not running locally<br />
                        • Ingestion pipeline failure
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <Button onClick={onRetry} size="lg" className="w-full sm:w-auto h-14 px-8 bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-500/20 transition-all active:scale-95">
                        <RotateCcw className="w-5 h-5 mr-2" />
                        Retry Connection
                    </Button>

                    <Button asChild variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                        <Link href="/">
                            <Home className="w-5 h-5 mr-2" />
                            Return Dashboard
                        </Link>
                    </Button>
                </div>

                {/* Decorative Footer info */}
                <div className="pt-12 text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                    Contexta Secure Infrastructure
                </div>

            </div>
        </div>
    );
}