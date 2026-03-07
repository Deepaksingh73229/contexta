'use client'

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Search, FileText, BrainCircuit } from 'lucide-react';
import folderImg from "@/public/folder.svg"
import Image from "next/image";
import Link from "next/link";

export default function Hero() {
    return (
        <section className="relative pt-10 pb-24 md:pt-20 md:pb-32 overflow-hidden">
            {/* Background decorative gradient blob */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-125 bg-purple-500/10 dark:bg-purple-500/20 blur-[120px] rounded-full -z-10"></div>

            <div className="container mx-auto px-4 text-center">

                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400 border-purple-100 dark:border-purple-900">
                    Introducing Institutional AI Memory
                </Badge>

                <h1 className="text-5xl md:text-8xl font-extrabold tracking-tighter mb-8">
                    Stop searching folders. <br className="hidden md:block" />
                    <span className="bg-clip-text text-transparent bg-linear-to-r from-purple-600 to-violet-500 dark:from-purple-400 dark:to-violet-400">
                        Start finding answers.
                    </span>
                </h1>

                <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                    Instantly retrieve data from thousands of institutional documents.
                    Your secure AI assistant that knows exactly where your information is hidden.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                    <Button size="lg" className="w-full sm:w-auto text-lg h-12 px-8 bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500 dark:hover:bg-purple-600">
                        <Link href="\ingest">
                            Upload Document
                        </Link>
                    </Button>

                    <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg h-12 px-8 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <Link href="\chat">
                            Search Document
                        </Link>
                    </Button>
                </div>

                {/* Abstract Product Mockup UI */}
                <div className="relative mx-auto max-w-5xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden">
                    <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900/50">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        </div>
                        <div className="ml-4 text-sm text-zinc-400">Contexta Dashboard</div>
                    </div>
                    <div className="p-6 md:p-12 bg-zinc-50/50 dark:bg-zinc-900/50">
                        {/* Mock Chat Interface */}
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* User Query */}
                            <div className="flex justify-end">
                                <div className="bg-purple-600 text-white px-6 py-3 rounded-2xl rounded-tr-sm max-w-lg">
                                    "Get me the passout student data for the 2016 batch."
                                </div>
                            </div>
                            {/* AI Response */}
                            <div className="flex justify-start items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center shrink-0">
                                    <BrainCircuit className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-6 py-4 rounded-2xl rounded-tl-sm shadow-sm w-full">
                                    <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed mb-4">
                                        Based on the records, there were <strong>450 students</strong> in the 2016 passout batch across all departments. The overall pass percentage was 94%.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="gap-1 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
                                            <FileText className="h-3.5 w-3.5" />
                                            Source: Annual_Report_2016_Final.pdf (Page 14)
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                            {/* Mock Input */}
                            <div className="mt-8 relative">
                                <input type="text" placeholder="Ask anything about your data..." disabled className="w-full border border-zinc-300 dark:border-zinc-700 rounded-xl py-4 pl-6 pr-16 bg-white dark:bg-zinc-900 text-zinc-400 shadow-sm" />
                                <div className="absolute right-3 top-3 bg-purple-600 p-2 rounded-lg">
                                    <Search className="h-5 w-5 text-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};