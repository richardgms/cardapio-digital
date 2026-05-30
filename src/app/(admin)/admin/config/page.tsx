import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ConfigManager } from "@/components/admin/config/ConfigManager";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Configurações da Loja",
};

export default async function ConfigPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/admin/login");
    }

    // Fetch Config for THIS user
    const { data: config, error } = await supabase
        .from("store_config")
        .select("*")
        .eq('id', user.id)
        .maybeSingle();

    if (error) {
        console.error("Error fetching config:", error);
    }

    // Initial data fallback
    const initialData = config || {
        id: user.id,
        name: "",
        whatsapp: "",
        minimum_order: 0,
        logo_url: null,
        admin_email: user.email || "",
        subdomain: "",
        pix_key: "",
        pix_key_type: null,
        table_mode_enabled: false,
        table_count: 10,
    };

    return (
        <div className="max-w-2xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Configurações" }
            ]} />
            <h1 className="text-3xl font-bold tracking-tight mb-8">Configurações da Loja</h1>

            <ConfigManager 
                initialData={initialData as any} 
                storeId={user.id} 
                tableModeAvailable={config?.table_mode_available || false}
            />
        </div>
    );
}
