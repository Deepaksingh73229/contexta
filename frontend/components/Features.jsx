'use client'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { MessageSquareText, Zap, ShieldCheck } from 'lucide-react';

const features = [
    {
        icon: <MessageSquareText className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />,
        title: "Natural Language Search",
        description: "Forget complex database queries. Just ask questions like you're talking to a colleague, and get instant, accurate answers."
    },
    {
        icon: <Zap className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />,
        title: "Instant File Navigation",
        description: "We don't just summarize; we pinpoint the source. Get direct links to the exact file and page number where the information lives."
    },
    {
        icon: <ShieldCheck className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />,
        title: "Secure Institutional Data",
        description: "Your data never trains public models. Our siloed architecture ensures your sensitive records remain private and compliant."
    },
];

export default function Features() {
    return (
        <section id="features" className="py-24 bg-zinc-50 dark:bg-zinc-900/50 border-y border-zinc-200 dark:border-zinc-800">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Designed for the modern administrator.</h2>
                    <p className="text-lg text-zinc-600 dark:text-zinc-400">Stop wasting hours manually digging through digital filing cabinets.</p>
                </div>
                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {features.map((feature, index) => (
                        <Card key={index} className="bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                            <CardHeader>
                                <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl w-fit">
                                    {feature.icon}
                                </div>
                                <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription className="text-zinc-600 dark:text-zinc-400 text-base leading-relaxed">
                                    {feature.description}
                                </CardDescription>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
};