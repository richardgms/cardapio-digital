import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2, Layout, Smartphone, Zap } from "lucide-react"

export function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col bg-white">
            {/* Header */}
            <header className="border-b sticky top-0 bg-white/80 backdrop-blur-sm z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xl text-primary">
                        <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-white">
                            <Layout className="h-5 w-5" />
                        </div>
                        RMenu
                    </div>
                    <nav className="flex items-center gap-4">
                        <Link href="/admin/login">
                            <Button variant="ghost">Entrar</Button>
                        </Link>
                        <Link href="/admin/login">
                            <Button>Começar Agora</Button>
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="flex-1">
                {/* Hero Section */}
                <section className="py-20 md:py-32 bg-gradient-to-b from-gray-50 to-white">
                    <div className="container mx-auto px-4 text-center">
                        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 mb-6">
                            Seu Cardápio Digital <br className="hidden md:block" />
                            <span className="text-primary">Simples e Profissional</span>
                        </h1>
                        <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
                            Crie seu cardápio online em minutos, receba pedidos no WhatsApp e fidelize seus clientes sem pagar taxas abusivas.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link href="/admin/login">
                                <Button size="lg" className="h-12 px-8 text-lg gap-2">
                                    Criar meu Cardápio <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                            <Link href="https://nutribox.rmenu.com.br" target="_blank">
                                <Button size="lg" variant="outline" className="h-12 px-8 text-lg">
                                    Ver Exemplo Real
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Features */}
                <section className="py-20 bg-white">
                    <div className="container mx-auto px-4">
                        <div className="grid md:grid-cols-3 gap-8">
                            <FeatureCard
                                icon={<Smartphone className="h-10 w-10 text-primary" />}
                                title="100% Responsivo"
                                description="Seu cardápio funciona perfeitamente em qualquer celular, tablet ou computador."
                            />
                            <FeatureCard
                                icon={<Zap className="h-10 w-10 text-primary" />}
                                title="Pedidos no WhatsApp"
                                description="Receba pedidos prontos e organizados direto no seu WhatsApp, sem intermediários."
                            />
                            <FeatureCard
                                icon={<Layout className="h-10 w-10 text-primary" />}
                                title="Painel Intuitivo"
                                description="Atualize preços, fotos e descrições em tempo real com um painel super fácil de usar."
                            />
                        </div>
                    </div>
                </section>

                {/* Social Proof / Stats */}
                <section className="py-20 bg-gray-50 border-y">
                    <div className="container px-4 mx-auto text-center">
                        <h2 className="text-3xl font-bold mb-12">Por que escolher o RMenu?</h2>
                        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                            <Stat number="0%" label="de taxas sobre pedidos" />
                            <Stat number="24h" label="suporte técnico" />
                            <Stat number="∞" label="acessos ilimitados" />
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-12">
                <div className="container mx-auto px-4 text-center">
                    <p>&copy; {new Date().getFullYear()} RMenu. Todos os direitos reservados.</p>
                </div>
            </footer>
        </div>
    )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
    return (
        <div className="p-6 rounded-2xl bg-gray-50 border hover:shadow-lg transition-shadow">
            <div className="mb-4">{icon}</div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{title}</h3>
            <p className="text-gray-600">{description}</p>
        </div>
    )
}

function Stat({ number, label }: { number: string, label: string }) {
    return (
        <div>
            <div className="text-4xl font-extrabold text-primary mb-2">{number}</div>
            <div className="text-gray-600 font-medium">{label}</div>
        </div>
    )
}
