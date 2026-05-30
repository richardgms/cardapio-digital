import { OrdersManager } from "@/components/admin/orders/OrdersManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador - Pedidos",
};

interface PageProps {
    params: Promise<{ storeId: string }>;
}

export default async function AdminProxyOrdersPage({ params }: PageProps) {
    const { storeId } = await params;

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Admin", href: "/admin/super" },
                { label: "Simulador", href: `/admin/super/lojista/${storeId}` },
                { label: "Pedidos" }
            ]} />
            
            <OrdersManager 
                storeId={storeId} 
                isImpersonating={true} 
            />
        </div>
    );
}
