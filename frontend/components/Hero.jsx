import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, BrainCircuit } from 'lucide-react';
import Link from "next/link";

export default function Hero() {
    return (
        <section className="relative pt-10 pb-24 md:pt-20 md:pb-32 overflow-hidden">
            {/* Playful background blobs */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-500/10 dark:bg-purple-600/15 blur-[120px] rounded-full -z-10 animate-pulse" />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-500/10 dark:bg-blue-600/15 blur-[100px] rounded-full -z-10 animate-float" />

            <div className="container mx-auto px-4 text-center">

                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-100 dark:border-purple-800 rounded-full">
                    ✨ Introducing Institutional AI Memory
                </Badge>

                <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1]">
                    Stop searching folders. <br className="hidden md:block" />
                    <span className="text-gradient">
                        Start finding answers.
                    </span>
                </h1>

                <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
                    Instantly retrieve data from thousands of institutional documents.
                    Your secure AI assistant that knows exactly where your information is hidden.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                    <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-10 rounded-2xl bg-primary hover:scale-105 transition-transform shadow-lg shadow-purple-500/25 text-white">
                        <Link href="\ingest">
                            Upload Document
                        </Link>
                    </Button>

                    <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg h-14 px-10 rounded-2xl border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:scale-105 transition-transform">
                        <Link href="\chat">
                            Search Document
                        </Link>
                    </Button>
                </div>

                {/* Abstract Product Mockup UI with playful glass effect */}
                <div className="relative mx-auto max-w-5xl rounded-[32px] border border-white/20 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                    <div className="border-b border-white/20 dark:border-white/5 p-5 flex items-center gap-2 bg-white/40 dark:bg-white/5">
                        <div className="flex gap-2">
                            <div className="w-3.5 h-3.5 rounded-full bg-red-400 shadow-inner"></div>
                            <div className="w-3.5 h-3.5 rounded-full bg-yellow-400 shadow-inner"></div>
                            <div className="w-3.5 h-3.5 rounded-full bg-green-400 shadow-inner"></div>
                        </div>
                        <div className="ml-4 text-sm font-semibold text-zinc-500 dark:text-zinc-400">Contexta Intelligence</div>
                    </div>
                    <div className="p-6 md:p-12">
                        {/* Mock Chat Interface */}
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* User Query */}
                            <div className="flex justify-end animate-slide-in-right">
                                <div className="bg-primary text-white px-8 py-4 rounded-[24px] rounded-tr-sm shadow-md">
                                    "Get me the passout student data for the 2016 batch."
                                </div>
                            </div>
                            {/* AI Response */}
                            <div className="flex justify-start items-start gap-4 animate-slide-in-left">
                                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 shadow-xl flex items-center justify-center shrink-0 ring-1 ring-black/5">
                                    <BrainCircuit className="h-6 w-6 text-purple-500" />
                                </div>
                                <div className="bg-white/80 dark:bg-zinc-900/80 border border-white/20 dark:border-white/5 px-8 py-5 rounded-[24px] rounded-tl-sm shadow-sm w-full">
                                    <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed mb-4 text-lg font-medium">
                                        Based on the records, there were <span className="text-purple-600 dark:text-purple-400 font-bold">450 students</span> in the 2016 passout batch across all departments. The overall pass percentage was 94%.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="gap-2 px-3 py-1 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 rounded-full">
                                            <FileText className="h-4 w-4 text-purple-500" />
                                            Annual_Report_2016_Final.pdf
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
