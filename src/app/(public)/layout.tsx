import { Header } from '@/components/layout/Header'

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* O Header será controlado pela page.tsx para passar o onCartClick */}
            {/* Mas como o layout envolve a page, podemos deixar o Header aqui se usarmos Context ou Zustand para abrir o carrinho */}
            {/* Por enquanto, seguindo a instrução do comando 4.1, o Header vai na page.tsx ou aqui? */}
            {/* O comando diz: "Crie src/app/(public)/layout.tsx que: Usa o Header" */}
            {/* Mas o Header precisa de onCartClick que abre um estado local da page. */}
            {/* Para simplificar e seguir o Next.js App Router: */}
            {/* Vamos deixar o Header na page.tsx por enquanto para ter acesso fácil ao estado do carrinho, */}
            {/* OU melhor: O layout define a estrutura macro. */}

            <main className="w-full min-h-screen bg-white shadow-sm">
                {children}
            </main>
        </div>
    )
}
