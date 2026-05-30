import type { Metadata } from "next";
import AdminLoginPage from "./login-client";

export const metadata: Metadata = {
    title: "Área Administrativa",
};

export default function Page() {
    return <AdminLoginPage />;
}
