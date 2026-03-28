import { ProductForm } from "@/components/admin/products/ProductForm";
import { withSuperAdmin } from "@/lib/auth-guards";

export default async function Page({ params }: { params: Promise<{ storeId: string; id: string }> }) {
    const { storeId, id } = await params;

    // Proteção extra: validar se é Super Admin antes de renderizar
    return withSuperAdmin(async () => {
        return <ProductForm productId={id} isImpersonating={true} storeId={storeId} />;
    });
}
