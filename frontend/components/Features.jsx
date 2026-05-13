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
        icon: <MessageSquareText className="h-10 w-10 text-violet-500/50" />,
        title: "Natural Language Search",
        description: "Forget complex database queries. Just ask questions like you're talking to a colleague, and get instant, accurate answers.",
        color: "bg-violet-500 shadow-violet-200 dark:shadow-violet-900/20"
    },

    {
        icon: <Zap className="h-10 w-10 text-blue-500/50" />,
        title: "Instant File Navigation",
        description: "We don't just summarize; we pinpoint the source. Get direct links to the exact file and page number where the information lives.",
        color: "bg-blue-500 shadow-blue-200 dark:shadow-blue-900/20"
    },
    
    {
        icon: <ShieldCheck className="h-10 w-10 text-emerald-500/50" />,
        title: "Secure Institutional Data",
        description: "Your data never trains public models. Our siloed architecture ensures your sensitive records remain private and compliant.",
        color: "bg-emerald-500 shadow-emerald-200 dark:shadow-emerald-900/20"
    },
];

export default function Features() {
    return (
        <section id="features" className="py-24 relative overflow-hidden">
            <div className="container mx-auto px-4">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">Designed for the <span className="text-gradient">modern</span> administrator.</h2>
                    <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">Stop wasting hours manually digging through digital filing cabinets.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-10 max-w-7xl mx-auto">
                    {
                        features.map((feature, index) => (
                            <Card key={index} className="group relative bg-neutral-100/50 dark:bg-zinc-900/50 border-white/20 dark:border-white/5  rounded-[32px] p-4 transition-all hover:-translate-y-2 hover:shadow-2xl">
                                <CardHeader className="flex gap-3 items-center">
                                    {feature.icon}

                                    <CardTitle className="text-xl font-black">{feature.title}</CardTitle>
                                </CardHeader>

                                <CardContent className="">
                                    <CardDescription className="text-zinc-600 dark:text-zinc-300 text-lg leading-relaxed">
                                        {feature.description}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        ))
                    }
                </div>
            </div>
        </section>
    );
}
