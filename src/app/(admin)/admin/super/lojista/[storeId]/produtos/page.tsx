import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { ProductManager } from "@/components/admin/products/ProductManager";
import { fetchProductsForProxy } from "@/actions/admin/proxy-products";

export default async function ImpersonateProductsPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    const products = await fetchProductsForProxy(storeId);

    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: "Dashboard (Super)", href: "/admin/super" },
                { label: "Simulador Loja", href: `/admin/super/lojista/${storeId}` },
                { label: "Produtos" }
            ]} />
            
            <ProductManager 
                initialProducts={products || []} 
                storeId={storeId} 
                isImpersonating={true}
                basePath={`/admin/super/lojista/${storeId}`} 
            />
        </div>
    );
}
