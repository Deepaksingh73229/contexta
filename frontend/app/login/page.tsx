"use client"

import { useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ContextaLogo } from "@/components/ui/logo"
import { AuthGuard } from "@/lib/providers"
import { useAuth } from "@/lib/hooks"

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
            <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-neutral-50 dark:bg-[#050505] p-6 md:p-10">
                {/* Subtle Ambient Background Glow */}
                <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-violet-500/10 via-transparent to-transparent dark:from-violet-500/5" />

                {/* Glassmorphic Auth Card */}
                <div className="relative z-10 w-full max-w-105 animate-in fade-in zoom-in-95 duration-700 ease-out">
                    <div className="flex flex-col rounded-2xl border border-neutral-200/80 bg-white/90 p-8 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-[#0A0A0A]/90 dark:shadow-black/50 sm:p-10">

                        {/* Brand Header */}
                        <div className="mb-8 flex flex-col items-center space-y-3 text-center">
                            <div className="flex size-16 items-center justify-center rounded-2xl bg-white dark:bg-[#0A0A0A] shadow-xl shadow-violet-500/10 ring-1 ring-neutral-200 dark:ring-white/10">
                                <ContextaLogo size="lg" />
                            </div>

                            <div className="space-y-1.5">
                                <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                                    Contexta
                                </h1>
                                <p className="text-[14px] text-neutral-500 dark:text-neutral-400">
                                    Stop searching folders. Start finding answers.
                                </p>
                            </div>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                                    <AlertDescription className="text-[13px] font-medium">
                                        {error}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username</Label>
                                    <Input
                                        id="username"
                                        autoComplete="username"
                                        placeholder="admin"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        disabled={isLoading}
                                        required
                                        className="bg-neutral-50/50 dark:bg-black/50"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
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
                                            className="bg-neutral-50/50 pr-10 dark:bg-black/50"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1 size-8 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                                            onClick={() => setShowPassword((v) => !v)}
                                            tabIndex={-1}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="size-4" />
                                            ) : (
                                                <Eye className="size-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-600 dark:hover:bg-violet-700"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                        Signing in…
                                    </>
                                ) : (
                                    "Sign in"
                                )}
                            </Button>
                        </form>

                        {/* Security Badge Footer */}
                        <div className="mt-8 border-t border-neutral-100 pt-6 dark:border-white/5">
                            <p className="text-center font-mono text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                                Fully offline · JWT secured · Role-based access
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </AuthGuard>
    )
}