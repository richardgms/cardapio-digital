import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ProductManager } from "@/components/admin/products/ProductManager";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Produtos",
};

export default async function ProductsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return null;
    }

    const { data: products } = await supabase
        .from("products")
        .select(`
            *,
            categories(name)
        `)
        .eq('store_id', user.id)
        .order("name");

    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Produtos" }
            ]} />
            
            <ProductManager 
                initialProducts={products || []} 
                storeId={user.id} 
                basePath="/admin" 
            />
        </div>
    );
}
