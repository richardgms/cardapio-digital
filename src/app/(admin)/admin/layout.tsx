"use client"

import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/admin-panel/app-sidebar'
import { LayoutProvider } from '@/context/layout-provider'
import { Separator } from '@/components/ui/separator'

import { usePathname } from "next/navigation"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const isLoginPage = pathname === "/admin/login"

    if (isLoginPage) {
        return <LayoutProvider>{children}</LayoutProvider>
    }

    return (
        <LayoutProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                        <div className="flex items-center gap-2 px-4">
                            <SidebarTrigger className="-ml-1" />
                            <Separator orientation="vertical" className="mr-2 h-4" />
                            {/* Breadcrumbs can come here later */}
                        </div>
                    </header>
                    <main className="flex-1 p-4 pt-2">
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </LayoutProvider>
    )
}
