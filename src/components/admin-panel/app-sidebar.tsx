"use client"

import { useLayout } from '@/context/layout-provider'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton
} from '@/components/ui/sidebar'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import {
    LayoutDashboard,
    Package,
    Folder,
    MapPin,
    Settings,
    UtensilsCrossed,
    Clock
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function AppSidebar() {
    const { collapsible, variant } = useLayout()
    const { user } = useAuth()

    // Dados do menu em Português
    const sidebarData = {
        user: {
            name: 'Administrador',
            email: user?.email || 'admin@sistema.com',
            avatar: '',
        },
        navGroups: [
            {
                title: 'Geral',
                items: [
                    {
                        title: 'Dashboard',
                        url: '/admin',
                        icon: LayoutDashboard,
                    }
                ]
            },
            {
                title: 'Cardápio',
                items: [
                    {
                        title: 'Produtos',
                        url: '/admin/produtos',
                        icon: Package,
                    },
                    {
                        title: 'Categorias',
                        url: '/admin/categorias',
                        icon: Folder,
                    }
                ]
            },
            {
                title: 'Configuração',
                items: [
                    {
                        title: 'Zonas de Entrega',
                        url: '/admin/zonas',
                        icon: MapPin,
                    },
                    {
                        title: 'Horários',
                        url: '/admin/horarios',
                        icon: Clock,
                    },
                    {
                        title: 'Configurações',
                        url: '/admin/config',
                        icon: Settings,
                    },
                    ...(user?.email === 'richardgms001@gmail.com' ? [{
                        title: 'Super Admin',
                        url: '/admin/super',
                        icon: Settings, // Or another icon like ShieldAlert or ShieldCheck
                    }] : [])
                ]
            }
        ]
    }

    return (
        <Sidebar collapsible={collapsible} variant={variant}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <div className="flex items-center gap-2">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                    <UtensilsCrossed className="size-4" />
                                </div>
                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold">Cardápio Digital</span>
                                    <span className="">v1.0.0</span>
                                </div>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                {sidebarData.navGroups.map((props) => (
                    <NavGroup key={props.title} {...props} />
                ))}
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={sidebarData.user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
