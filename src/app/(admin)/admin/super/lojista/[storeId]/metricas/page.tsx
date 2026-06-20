import { MetricsManager } from "@/components/admin/metrics/MetricsManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador - Métricas",
};

interface PageProps {
    params: Promise<{ storeId: string }>;
}

export default async function AdminProxyMetricsPage({ params }: PageProps) {
    const { storeId } = await params;

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Admin", href: "/admin/super" },
                { label: "Simulador", href: `/admin/super/lojista/${storeId}` },
                { label: "Métricas" }
            ]} />
            
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Métricas do Restaurante</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Visualizando métricas de vendas e faturamento como Super Admin.
                    </p>
                </div>
            </div>

            <MetricsManager 
                storeId={storeId} 
                isImpersonating={true} 
            />
        </div>
    );
}
