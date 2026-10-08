import { OrdersManager } from "@/components/admin/orders/OrdersManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Painel de Pedidos",
};

export default function PedidosPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Pedidos" },
            ]} />
            <OrdersManager reprintsEnabled={process.env.RMENU_PRINT_AGENT_ENABLED === '1' && process.env.RMENU_PRINT_ACTIVATION_READY === '1'} />
        </div>
    );
}
