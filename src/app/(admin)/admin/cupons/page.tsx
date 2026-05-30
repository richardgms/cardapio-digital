import { CouponManager } from "@/components/admin/coupons/CouponManager";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Cupons",
};

export default function CouponsPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20">
            <Breadcrumb items={[
                { label: "Dashboard", href: "/admin" },
                { label: "Cupons" }
            ]} />
            <CouponManager />
        </div>
    );
}
