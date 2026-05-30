import { CookieBanner } from '@/components/layout/CookieBanner'
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"

function getSubdomainFromServer(host: string): string | null {
    const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost').split(':')[0]
    const hostname = host.split(':')[0]

    // Desenvolvimento local: nutribox.localhost ou nutribox.local
    if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        const parts = hostname.split('.')
        return parts.length >= 2 ? parts[0] : null
    }

    // Domínio raiz ou www
    if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null

    // Subdomínio de produção: nutribox.rmenu.com.br
    if (hostname.endsWith(`.${rootDomain}`)) {
        const sub = hostname.replace(`.${rootDomain}`, '')
        return sub === 'www' ? null : sub
    }

    return null
}

export async function generateMetadata(): Promise<Metadata> {
    const headersList = await headers()
    const host = headersList.get('host') || ""
    const subdomain = getSubdomainFromServer(host)

    if (!subdomain) {
        return {}
    }

    try {
        const supabase = await createClient()
        const { data: store } = await supabase
            .from("store_config")
            .select("name, logo_url")
            .eq("subdomain", subdomain)
            .single()

        if (store) {
            const title = store.name
            const description = `Faça seu pedido online no ${store.name}`
            const imageUrl = store.logo_url || `https://${host}/apple-touch-icon.png`

            return {
                title: {
                    default: title,
                    template: `%s | ${title}`,
                },
                description,
                openGraph: {
                    title,
                    description,
                    images: [
                        {
                            url: imageUrl,
                            width: 500,
                            height: 500,
                            alt: store.name,
                        }
                    ],
                    type: "website",
                    locale: "pt_BR",
                    siteName: store.name,
                },
                appleWebApp: {
                    title,
                }
            }
        }
    } catch (error) {
        console.error("Erro ao gerar metadados dinâmicos:", error)
    }

    return {}
}

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            <main className="w-full min-h-screen bg-white shadow-sm">
                {children}
            </main>
            <CookieBanner />
        </div>
    )
}
