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
            {/* Playful background glows */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 blur-[120px] rounded-full -z-10 animate-pulse" />

            <div className="container mx-auto px-4">
                <div className="text-center mb-24">
                    <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">Your archive, activated in <span className="text-gradient">3 steps.</span></h2>
                </div>

                <div className="grid md:grid-cols-3 gap-16 relative max-w-6xl mx-auto">
                    {/* Connector lines for desktop with playful gradient */}
                    <div className="hidden md:block absolute top-20 left-[15%] right-[15%] h-1 bg-linear-to-r from-violet-200 via-purple-300 to-indigo-200 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800 -z-10 rounded-full opacity-50"></div>

                    {steps.map((step, index) => (
                        <div key={index} className="flex flex-col items-center text-center relative z-10 group">
                            <div className="w-24 h-24 rounded-[32px] bg-white dark:bg-zinc-900 border-2 border-purple-100 dark:border-purple-900/30 shadow-xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-8 transition-transform group-hover:rotate-6 group-hover:scale-110">
                                {step.icon}
                            </div>
                            <h3 className="text-2xl font-black mb-4">{step.title}</h3>
                            <p className="text-zinc-600 dark:text-zinc-300 text-lg font-medium leading-relaxed">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
