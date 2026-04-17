'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const CONSENT_KEY = 'rmenu_cookie_consent'

export function CookieBanner() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const consent = localStorage.getItem(CONSENT_KEY)
        if (!consent) setVisible(true)
    }, [])

    function accept() {
        localStorage.setItem(CONSENT_KEY, 'accepted')
        setVisible(false)
    }

    function dismiss() {
        localStorage.setItem(CONSENT_KEY, 'dismissed')
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#171717] text-white shadow-2xl border-t border-white/10">
            <div className="container mx-auto max-w-5xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <p className="flex-1 text-sm text-white/60 leading-relaxed">
                    Usamos cookies e armazenamento local para salvar seu carrinho e facilitar seus próximos pedidos.{' '}
                    <Link href="/privacidade" className="underline text-white/80 hover:text-white transition-colors">
                        Política de Privacidade
                    </Link>
                    .
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        size="sm"
                        className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border-0 shadow-none cursor-pointer"
                        onClick={dismiss}
                    >
                        Recusar
                    </Button>
                    <Button
                        size="sm"
                        className="bg-white text-black hover:bg-white/90 shadow-none cursor-pointer"
                        onClick={accept}
                    >
                        Aceitar cookies
                    </Button>
                    <button
                        onClick={dismiss}
                        className="text-white/40 hover:text-white transition-colors p-1 ml-1 cursor-pointer"
                        aria-label="Fechar aviso de cookies"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
