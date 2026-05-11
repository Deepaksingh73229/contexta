import Link from "next/link";
import { BrainCircuit } from 'lucide-react';
import { ThemeToggle } from "@/components/theme-toggle";

import logo from "@/public/logo.png"
import Image from "next/image";

export default function Navbar() {
    return (
        <header className="sticky top-5 z-50 w-[70%] mx-auto border rounded-full border-neutral-200/50 dark:border-neutral-500/50 bg-neutral-100/10 dark:bg-neutral-600/10 backdrop-blur-xs">
            <div className="container mx-auto max-w-7xl px-4 md:px-6 h-14 flex items-center justify-between">
                <Link
                    href="/"
                    className="flex flex-row-reverse items-center gap-2.5 group transition-all"
                >
                    <Image
                        src={logo}
                        alt="contexta-logo"
                        loading="lazy"
                        className="w-12 h-12"
                    />

                    <span className="text-3xl font-black tracking-wide text-neutral-700 dark:text-neutral-200">
                        Contexta
                    </span>
                </Link>

                <div className="flex items-center gap-3">
                    <ThemeToggle className="cursor-pointer" />

                    <div className="h-6 w-px bg-neutral-400 dark:bg-white/10 mx-1" />

                    <Link href="/login">
                        <button
                            className="bg-neutral-100/20 dark:bg-neutral-500/20 border border-neutral-500/20 dark:border-neutral-600/20 font-bold text-indigo-500 dark:text-indigo-400 backdrop-blur-3xl px-5 py-2 rounded-xl hover:text-indigo-700 cursor-pointer"
                        >
                            Sign In
                        </button>
                    </Link>
                </div>
            </div>
        </header>
    );
};