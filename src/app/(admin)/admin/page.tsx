import type { Metadata } from "next";
import AdminDashboard from "./dashboard-client";

export const metadata: Metadata = {
    title: "Dashboard",
};

export default function Page() {
    return <AdminDashboard />;
}
