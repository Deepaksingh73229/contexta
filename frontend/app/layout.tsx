// app/layout.tsx — Root layout: providers, fonts, theme
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { ReduxProvider } from "@/lib/providers"
import Navbar from "@/components/Navbar"
// import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: { default: "Contexta", template: "%s | Contexta" },
  description: "Stop searching folders. Start finding answers.",
  icons: { icon: "/favicon.ico" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ReduxProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {/* <Navbar /> */}
            {children}
            {/* <Toaster /> */}
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  )
}