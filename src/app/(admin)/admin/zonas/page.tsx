import { DeliveryZoneManager } from "@/components/admin/zones/DeliveryZoneManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Zonas de Entrega",
};

export default function DeliveryZonesPage() {
    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Zonas de Entrega" }
            ]} />
            <DeliveryZoneManager />
        </div>
    );
}
