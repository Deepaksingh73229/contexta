// app/login/page.tsx
"use client"

import { useState } from "react"
import { Database, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-sm space-y-8">
                    {/* Brand */}
                    <div className="space-y-2 text-center">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--brand-muted))]">
                            <Database className="h-6 w-6 text-[hsl(var(--brand))]" />
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight">Contexta</h1>
                        <p className="text-sm text-muted-foreground">
                            Stop searching folders. Start finding answers.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                autoComplete="username"
                                placeholder="admin"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
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
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full w-10 text-muted-foreground"
                                    onClick={() => setShowPassword((v) => !v)}
                                    tabIndex={-1}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                            ) : (
                                "Sign in"
                            )}
                        </Button>
                    </form>

                    <p className="text-center text-xs text-muted-foreground">
                        Fully offline · JWT secured · Role-based access
                    </p>
                </div>
            </div>
        </AuthGuard>
    )
}