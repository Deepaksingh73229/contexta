import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import projectImg from "@/public/secure_server.svg"
import {
  BrainCircuit,
  Github,
  Linkedin,
  Twitter,
  Mail,
  ArrowRight
} from 'lucide-react';
import Image from 'next/image';

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-zinc-950 border-t-10 rounded-t-4xl border-zinc-200 dark:border-zinc-900 font-sans text-zinc-950 dark:text-zinc-50 relative overflow-hidden">

      {/* Subtle Background Glow for Modern Feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-indigo-500/5 dark:bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>

      <div className="px-20">

        {/* Top Section: CTA & Newsletter */}
        <div className=" flex justify-between items-start md:items-center">
          <div className="flex flex-col gap-5">
            <div className="text-8xl text-neutral-800 dark:text-neutral-100 font-black tracking-tight mb-2">
              <span>Ready to </span> 
              <span className='text-purple-400/60'>secure</span>
              <span> your institutional memory?</span>
            </div>

            <p className="font-medium text-zinc-500 dark:text-zinc-400">
              Stop searching folders. Start finding answers. Deploy Contexta locally today.
            </p>
          </div>

          <Image src={projectImg} alt='project-img'/>
        </div>

        {/* Bottom Section: Copyright */}
        <div className="py-5 flex flex-col md:flex-row justify-between items-center gap-4 border-t-2 ">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            © {new Date().getFullYear()} Contexta. | All Rights Reserved
          </p>

          <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
            <span>Collaborated by</span>
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Deepak | Nikhil | Sanu</span>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;