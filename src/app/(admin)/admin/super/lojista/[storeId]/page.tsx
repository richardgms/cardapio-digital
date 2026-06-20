import { validateSuperAdmin } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Settings, ExternalLink, LayoutDashboard, Folder, MapPin, Clock, ReceiptText, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador de Loja",
};

export default async function ImpersonateIndexPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await validateSuperAdmin();
    
    const adminClient = await createAdminClient();
    const { data: store, error } = await adminClient
        .from("store_config")
        .select("*")
        .eq("id", storeId)
        .single();
        
    if (error || !store) {
        return notFound();
    }

    const menuUrl = `https://${store.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'rmenu.com'}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">Painel de Controle: {store.name}</h1>
                <p className="text-muted-foreground flex items-center gap-2">
                    Visualizando como Super Admin: <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{storeId}</span>
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* PRODUTOS */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Produtos
                        </CardTitle>
                        <CardDescription>
                            Gere o catálogo de produtos e preços.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/produtos`}>
                            <Button className="w-full bg-black text-white">Acessar Produtos</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* CATEGORIAS */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Folder className="h-5 w-5" />
                            Categorias
                        </CardTitle>
                        <CardDescription>
                            Organize os produtos em seções.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/categorias`}>
                            <Button variant="outline" className="w-full border-black">Acessar Categorias</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* PEDIDOS */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ReceiptText className="h-5 w-5" />
                            Pedidos
                        </CardTitle>
                        <CardDescription>
                            Histórico de vendas e detalhes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/pedidos`}>
                            <Button variant="outline" className="w-full border-black">Ver Pedidos</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* MÉTRICAS */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Métricas
                        </CardTitle>
                        <CardDescription>
                            Veja faturamento, ticket médio e mais.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/metricas`}>
                            <Button variant="outline" className="w-full border-black">Ver Métricas</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* ZONAS DE ENTREGA */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Bairros e Taxas
                        </CardTitle>
                        <CardDescription>
                            Configure locais e preços de entrega.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/zonas`}>
                            <Button variant="outline" className="w-full border-black">Acessar Zonas</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* HORÁRIOS */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Horários
                        </CardTitle>
                        <CardDescription>
                            Defina quando a loja atende no automático.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/horarios`}>
                            <Button variant="outline" className="w-full border-black">Configurar Horários</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* CONFIGURAÇÕES */}
                <Card className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Configurações
                        </CardTitle>
                        <CardDescription>
                            WhatsApp, PIX e Logotipo da loja.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href={`/admin/super/lojista/${storeId}/config`}>
                            <Button variant="outline" className="w-full border-black">Acessar Config.</Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* VISUALIZAÇÃO EXTERNA */}
                <Card className="bg-zinc-50 border-dashed">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ExternalLink className="h-5 w-5" />
                            Cardápio Público
                        </CardTitle>
                        <CardDescription>
                            Link oficial do cliente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <a href={menuUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" className="w-full justify-start gap-2 hover:bg-zinc-100">
                                <span className="truncate">{store.subdomain}</span>
                                <ExternalLink className="h-4 w-4 ml-auto" />
                            </Button>
                        </a>
                    </CardContent>
                </Card>
            </div>

            {/* DASHBOARD INTEGRADO (Placeholder) */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LayoutDashboard className="h-5 w-5" />
                        Status da Loja
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 border rounded-lg bg-background">
                            <p className="text-xs text-muted-foreground uppercase font-bold">WhatsApp</p>
                            <p className="font-medium">{store.whatsapp}</p>
                        </div>
                        <div className="p-4 border rounded-lg bg-background">
                            <p className="text-xs text-muted-foreground uppercase font-bold">PIX Ativo</p>
                            <p className="font-medium">{store.pix_key ? 'Sim' : 'Não'}</p>
                        </div>
                        <div className="p-4 border rounded-lg bg-background">
                            <p className="text-xs text-muted-foreground uppercase font-bold">Modo Mesa</p>
                            <p className="font-medium">{store.table_mode_enabled ? 'Ativado' : 'Desativado'}</p>
                        </div>
                        <div className="p-4 border rounded-lg bg-background">
                            <p className="text-xs text-muted-foreground uppercase font-bold">Pedido Mínimo</p>
                            <p className="font-medium">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(store.minimum_order || 0)}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
