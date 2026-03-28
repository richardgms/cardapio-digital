import { validateSuperAdmin } from "@/lib/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { ImpersonationBanner } from "@/components/admin/super/ImpersonationBanner";
import { notFound } from "next/navigation";

export default async function ImpersonatorLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    // Validação estrita de escopo (apenas Super Admin chega aqui)
    await validateSuperAdmin();
    
    // Obter dados da loja para exibir no banner
    const adminClient = await createAdminClient();
    const { data: storeConfig, error } = await adminClient
        .from("store_config")
        .select("name")
        .eq("id", storeId)
        .single();
        
    if (error || !storeConfig) {
        return notFound();
    }

    return (
        <div className="flex flex-col min-h-screen">
            <ImpersonationBanner storeName={storeConfig.name} />
            <main className="flex-1 p-6">
                {children}
            </main>
        </div>
    );
}
