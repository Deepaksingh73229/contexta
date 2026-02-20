'use client'

import { BrainCircuit } from 'lucide-react';
import { Separator } from "@/components/ui/separator";

export default function Footer() {
    return (
        <footer className="bg-zinc-50 dark:bg-zinc-950 py-12 border-t border-zinc-200 dark:border-zinc-800">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="h-6 w-6 text-indigo-600 dark:text-indigo-500" />
                        <span className="text-xl font-bold tracking-tight">Contexta</span>
                    </div>
                    <div className="flex gap-8 text-sm text-zinc-600 dark:text-zinc-400 font-medium">
                        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50">Contact</a>
                        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50">Privacy Policy</a>
                        <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-50">Terms</a>
                    </div>
                </div>
                <Separator className="my-8 bg-zinc-200 dark:bg-zinc-800" />
                <div className="text-center text-sm text-zinc-500 dark:text-zinc-500">
                    © {new Date().getFullYear()} Contexta AI. A 7th Sem Minor Project.
                </div>
            </div>
        </footer>
    );
};