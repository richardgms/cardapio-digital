import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export function useAuth() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        // Obter sessão inicial
        const getSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                setUser(session?.user ?? null)
                setLoading(false)
            } catch (error) {
                console.error('Erro ao buscar sessão:', error)
                setLoading(false)
            }
        }

        getSession()

        // Inscrever para mudanças
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    const signOut = async () => {
        setLoading(true)
        try {
            await supabase.auth.signOut()
            router.push('/admin/login')
            router.refresh()
        } catch (error) {
            console.error('Erro ao sair:', error)
        } finally {
            setLoading(false)
        }
    }

    return { user, loading, signOut }
}
