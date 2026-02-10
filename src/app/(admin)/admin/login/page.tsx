"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2, Mail, UtensilsCrossed } from "lucide-react"
import { checkEmailAuthorized } from "@/actions/auth/check-auth"

export default function AdminLoginPage() {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState("")

    const supabase = createClient()

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        setError("")
        setIsSuccess(false)

        try {
            // 1. Verificar se é email autorizado (via Server Action segura)
            const { authorized, error: authCheckError } = await checkEmailAuthorized(email)

            if (!authorized) {
                throw new Error(authCheckError || "Email não autorizado.")
            }

            // 2. Enviar Magic Link
            const { error: authError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/api/auth/callback`,
                    shouldCreateUser: false, // Usuário JÁ DEVE existir (criado pelo Admin)
                },
            })

            if (authError) throw authError

            setIsSuccess(true)
        } catch (err: any) {
            let message = err.message || "Ocorreu um erro ao tentar entrar."

            // Tradução de erros comuns do Supabase
            if (message.includes("only request this after")) {
                const seconds = message.match(/\d+/)?.[0] || ""
                message = `Por questões de segurança, você só pode solicitar isso após ${seconds} segundos.`
            } else if (message.includes("email rate limit exceeded")) {
                message = "Limite de e-mails excedido. Aguarde alguns minutos e tente novamente."
            }

            setError(message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-50 overflow-hidden">
            <Card className="w-full max-w-md shadow-lg border-muted/60">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <UtensilsCrossed className="h-6 w-6" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">Área Administrativa</CardTitle>
                    <CardDescription>
                        Digite seu email para receber o link de acesso
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@exemplo.com"
                                    className="pl-10 h-10"
                                    value={email}
                                    onChange={(e: any) => setEmail(e.target.value)}
                                    required
                                    disabled={isLoading || isSuccess}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        {isSuccess && (
                            <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md flex items-center gap-2 border border-green-200">
                                <Mail className="h-4 w-4" />
                                <span>Link de acesso enviado! Verifique sua caixa de entrada.</span>
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-10 font-semibold text-base transition-all hover:scale-[1.01]"
                            disabled={isLoading || isSuccess}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                "Enviar Link de Acesso"
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-center border-t p-4 mt-2">
                    <p className="text-xs text-muted-foreground text-center">
                        Acesso restrito a administradores.
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
}
