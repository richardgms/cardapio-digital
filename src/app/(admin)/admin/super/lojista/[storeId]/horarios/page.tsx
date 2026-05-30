import { BusinessHoursManager } from "@/components/admin/hours/BusinessHoursManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Simulador - Horários",
};

interface PageProps {
    params: Promise<{ storeId: string }>;
}

export default async function AdminProxyHoursPage({ params }: PageProps) {
    const { storeId } = await params;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20 pt-6">
            <Breadcrumb items={[
                { label: "Admin", href: "/admin/super" },
                { label: "Simulador", href: `/admin/super/lojista/${storeId}` },
                { label: "Horários" }
            ]} />
            
            <BusinessHoursManager 
                storeId={storeId} 
                isImpersonating={true} 
            />
        </div>
    );
}
