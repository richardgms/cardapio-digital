import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ConfigManager } from "@/components/admin/config/ConfigManager";
import { fetchStoreConfigForProxy } from "@/actions/admin/proxy-config";

export default async function ImpersonateConfigPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    const config = await fetchStoreConfigForProxy(storeId);

    return (
        <div className="max-w-2xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Dashboard (Super)", href: "/admin/super" },
                { label: "Simulador Loja", href: `/admin/super/lojista/${storeId}` },
                { label: "Configurações" }
            ]} />
            <h1 className="text-3xl font-bold tracking-tight mb-8">Configurações da Loja (Proxy)</h1>

            <ConfigManager 
                initialData={config as any} 
                storeId={storeId} 
                isImpersonating={true}
                tableModeAvailable={config?.table_mode_available || false}
            />
        </div>
    );
}
