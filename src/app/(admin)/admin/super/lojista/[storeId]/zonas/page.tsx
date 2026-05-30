import { DeliveryZoneManager } from "@/components/admin/zones/DeliveryZoneManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador - Zonas de Entrega",
};

interface PageProps {
    params: Promise<{ storeId: string }>;
}

export default async function AdminProxyZonesPage({ params }: PageProps) {
    const { storeId } = await params;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Admin", href: "/admin/super" },
                { label: "Simulador", href: `/admin/super/lojista/${storeId}` },
                { label: "Zonas de Entrega" }
            ]} />
            
            <DeliveryZoneManager 
                storeId={storeId} 
                isImpersonating={true} 
            />
        </div>
    );
}
