import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { ReduxProvider } from "@/lib/providers"
import { Toaster } from "@/components/ui/sonner" // Ensure this points to the Sonner Toaster we built
import "./globals.css"

// Initialize Inter font with the CSS variable for Tailwind
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap", // Ensures text remains visible during webfont load
})

export const metadata: Metadata = {
  title: {
    default: "Contexta | Intelligent Knowledge Retrieval",
    template: "%s | Contexta"
  },
  description: "Stop searching folders. Start finding answers. A local RAG system for institutional data.",
  applicationName: "Contexta",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "Contexta",
    description: "Stop searching folders. Start finding answers.",
    type: "website",
  },
}

// Recommended: Move viewport configurations here in Next.js 14+
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents auto-zoom on input focus in iOS
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body
        className={`
          min-h-screen bg-white dark:bg-[#0A0A0A] text-neutral-900 dark:text-neutral-50 
          font-sans antialiased overflow-x-hidden
          selection:bg-violet-500/30 selection:text-violet-900 dark:selection:bg-violet-500/40 dark:selection:text-white
        `}
      >
        <ReduxProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="relative flex min-h-screen flex-col">
              {/* Optional: You can place a global TopNav or Sidebar here */}
              <main className="flex-1">
                {children}
              </main>
            </div>

            {/* Global Toaster Instance */}
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  )
}