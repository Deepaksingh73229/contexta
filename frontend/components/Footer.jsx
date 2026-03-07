import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  BrainCircuit, 
  Github, 
  Linkedin, 
  Twitter, 
  Mail, 
  ArrowRight 
} from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-900 pt-16 pb-8 font-sans text-zinc-950 dark:text-zinc-50 relative overflow-hidden">
      
      {/* Subtle Background Glow for Modern Feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-indigo-500/5 dark:bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>

      <div className="container mx-auto px-6 md:px-12 max-w-7xl">
        
        {/* Top Section: CTA & Newsletter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Ready to secure your institutional memory?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              Stop searching folders. Start finding answers. Deploy Contexta locally today.
            </p>
          </div>
          
          <div className="flex w-full md:w-auto items-center gap-2">
            <Input 
              type="email" 
              placeholder="Enter your work email" 
              className="max-w-[240px] bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
            />
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        <Separator className="bg-zinc-200 dark:bg-zinc-800 mb-12" />

        {/* Middle Section: Links Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-16">
          
          {/* Brand Column */}
          <div className="md:col-span-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">Contexta</span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed pr-4">
              The offline, intelligent retrieval-augmented generation platform built for modern educational and medical institutions.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links Columns */}
          <div className="space-y-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Product</h3>
            <ul className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Security & Offline Mode</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Integrations</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2">Changelog <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 hover:bg-indigo-100 px-1.5 py-0 text-[10px]">New</Badge></a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Resources</h3>
            <ul className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Local Deployment Guide</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">GitHub Repository</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Project Info</h3>
            <ul className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2"><Mail className="w-4 h-4"/> Contact Team</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">About the Project</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms of Service</a></li>
            </ul>
          </div>

        </div>

        {/* Bottom Section: Copyright */}
        <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800/60 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            © {new Date().getFullYear()} Contexta. Built for 7th Sem CSE Minor Project. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
            <span>Powered by</span>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Next.js & FastAPI</span>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;