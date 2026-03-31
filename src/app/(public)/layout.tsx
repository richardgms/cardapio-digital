import { CookieBanner } from '@/components/layout/CookieBanner'

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
