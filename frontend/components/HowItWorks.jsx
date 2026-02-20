'use client'

import { UploadCloud, ServerCog, MessagesSquare } from 'lucide-react';

const steps = [
    {
        icon: <UploadCloud className="h-8 w-8" />,
        title: "1. Ingest Data",
        desc: "Securely upload your existing folders of PDFs, Excel sheets, and Word docs."
    },
    {
        icon: <ServerCog className="h-8 w-8" />,
        title: "2. AI Processing",
        desc: "Contexta reads, indexes, and understands the semantic meaning of every page."
    },
    {
        icon: <MessagesSquare className="h-8 w-8" />,
        title: "3. Just Ask",
        desc: "Your team gets a simple chat interface to retrieve any data instantly."
    }
];

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="py-24 relative overflow-hidden">
            {/* Subtle background gradient */}
            <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-150 h-100 bg-violet-500/5 dark:bg-violet-500/10 blur-[100px] rounded-full -z-10"></div>

            <div className="container mx-auto px-4">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">Your entire archive, activated in 3 steps.</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-12 relative max-w-5xl mx-auto">
                    {/* Connector lines for desktop */}
                    <div className="hidden md:block absolute top-24 left-[20%] right-[20%] h-0.5 bg-linear-to-r from-indigo-200 via-violet-200 to-indigo-200 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800 -z-10"></div>

                    {steps.map((step, index) => (
                        <div key={index} className="flex flex-col items-center text-center relative z-10">
                            <div className="w-20 h-20 rounded-3xl bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-zinc-800 shadow-sm flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6">
                                {step.icon}
                            </div>
                            <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};