import { ProductForm } from "@/components/admin/products/ProductForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ProductForm productId={id} />;
}
