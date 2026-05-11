"use client"

import { useState } from "react"
import Image from "next/image"
import { Eye, EyeOff, Loader2, ShieldCheck, LockKeyhole, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthGuard } from "@/lib/providers"
import { useAuth } from "@/lib/hooks"
import Navbar from "@/components/Navbar"
import logo from "@/public/logo.png"

export default function LoginPage() {
    const { login, isLoading, error } = useAuth()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!username.trim() || !password) return
        await login({ username: username.trim(), password })
    }

    return (
        <AuthGuard>
            <div className="min-h-screen flex flex-col">
                <Navbar />

                <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 relative">
                    {/* Glassmorphic Auth Card */}
                    <div className="relative z-10 w-full max-w-[500px] animate-in fade-in zoom-in-95 duration-700 ease-out">
                        <div className="flex flex-col gap-5 rounded-[40px] border border-white/20 bg-white/40 dark:bg-black/40 p-10 md:p-12 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10">
                            {/* Brand Header */}
                            <div className="flex flex-col items-center space-y-4 text-center">
                                <div className="flex size-24 items-center justify-center rounded-[32px] bg-white dark:bg-zinc-900 shadow-2xl ring-1 ring-black/5 rotate-3 transition-transform hover:rotate-0 overflow-hidden">
                                    <Image
                                        src={logo}
                                        alt="Contexta Logo"
                                        className="w-16 h-16 object-contain"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <h1 className="text-4xl font-black tracking-tight text-neutral-900 dark:text-white">
                                        Welcome Back
                                    </h1>

                                    <p className="text-base font-medium text-neutral-500 dark:text-zinc-400">
                                        Access your institutional memory
                                    </p>
                                </div>
                            </div>

                            {/* Login Form */}
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {error && (
                                    <Alert variant="destructive" className="animate-in slide-in-from-top-2 rounded-2xl border-red-100 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-400">
                                        <AlertDescription className="text-sm font-bold">
                                            {error}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="space-y-5">
                                    <div className="space-y-1">
                                        <Label htmlFor="username" className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            Username
                                        </Label>

                                        <Input
                                            id="username"
                                            autoComplete="username"
                                            placeholder="admin"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            disabled={isLoading}
                                            required
                                            className="h-10 rounded-md bg-white/50 border-zinc-200 dark:bg-black/50 dark:border-zinc-800 px-6 focus:ring-2 focus:ring-primary/20 transition-all font-medium text-md"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label htmlFor="password" className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            Password
                                        </Label>

                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="current-password"
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                disabled={isLoading}
                                                required
                                                className="h-10 rounded-md bg-white/50 border-zinc-200 dark:bg-black/50 dark:border-zinc-800 px-6 pr-14 focus:ring-2 focus:ring-primary/20 transition-all font-medium text-md"
                                            />

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-5 top-2.5 size-5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 rounded-xl"
                                                onClick={() => setShowPassword((v) => !v)}
                                                tabIndex={-1}
                                                aria-label={showPassword ? "Hide password" : "Show password"}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="size-6" />
                                                ) : (
                                                    <Eye className="size-6" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-10 rounded-md bg-primary hover:scale-[1.02] active:scale-95 transition-all text-white font-black text-xl shadow-xl shadow-primary/20"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 size-6 animate-spin" />
                                            Authenticating…
                                        </>
                                    ) : (
                                        "Sign In"
                                    )}
                                </Button>
                            </form>

                            {/* Security Badge Footer */}
                            <div className="flex justify-center gap-6 opacity-70 cursor-default text-sky-600">
                                <ShieldCheck className="size-6" />
                                <LockKeyhole className="size-6" />
                                <Database className="size-6" />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </AuthGuard>
    )
}
