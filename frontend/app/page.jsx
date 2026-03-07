'use client'

import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import Footer from '@/components/Footer';

function App() {
  // Note: In a real Next.js/React setup, you'd handle theme switching (light/dark)
  // using a context provider like next-themes. This layout assumes that provider exists
  // around it, enabling the 'dark:' tailwind classes to work.

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 font-sans antialiased">
      <Hero />
      <Features />
      <HowItWorks />
      <Footer/>
    </div>
  );
}

export default App;