import { CategoryManager } from "@/components/admin/categories/CategoryManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador - Categorias",
};

interface PageProps {
    params: Promise<{ storeId: string }>;
}

export default async function AdminProxyCategoriesPage({ params }: PageProps) {
    const { storeId } = await params;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Admin", href: "/admin/super" },
                { label: "Simulador", href: `/admin/super/lojista/${storeId}` },
                { label: "Categorias" }
            ]} />
            
            <CategoryManager 
                storeId={storeId} 
                isImpersonating={true} 
            />
        </div>
    );
}
