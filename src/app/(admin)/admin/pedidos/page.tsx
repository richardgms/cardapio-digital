import { OrdersManager } from "@/components/admin/orders/OrdersManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { isPrintActivationReadyForStore } from "@/lib/print-activation";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Painel de Pedidos",
};

export default async function PedidosPage() {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Pedidos" },
            ]} />
            <OrdersManager reprintsEnabled={isPrintActivationReadyForStore(error ? null : user?.id)} />
        </div>
    );
}
