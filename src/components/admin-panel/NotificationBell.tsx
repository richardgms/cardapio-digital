"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { fetchNotificationsWithReadStatus, markAllNotificationsRead } from "@/actions/admin/notifications"
import type { Notification } from "@/types/database"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

type NotificationWithRead = Notification & { is_read: boolean }

export function NotificationBell() {
    const [notifications, setNotifications] = useState<NotificationWithRead[]>([])
    const [open, setOpen] = useState(false)

    const unreadCount = notifications.filter(n => !n.is_read).length

    const load = useCallback(async () => {
        try {
            const data = await fetchNotificationsWithReadStatus()
            setNotifications(data)
        } catch {}
    }, [])

    useEffect(() => {
        load()
    }, [load])

    async function handleOpen(isOpen: boolean) {
        setOpen(isOpen)
        if (isOpen && unreadCount > 0) {
            const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            await markAllNotificationsRead(unreadIds)
        }
    }

    return (
        <Popover open={open} onOpenChange={handleOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground border-0">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0"
                side="right"
                align="end"
                sideOffset={8}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <span className="font-semibold text-sm">Notificações</span>
                    {unreadCount === 0 && notifications.length > 0 && (
                        <span className="text-xs text-muted-foreground">Tudo lido</span>
                    )}
                </div>

                {notifications.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma notificação
                    </div>
                ) : (
                    <ScrollArea className="max-h-96">
                        <div className="divide-y">
                            {notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={cn(
                                        "px-4 py-3 text-sm transition-colors",
                                        !n.is_read && "bg-primary/5"
                                    )}
                                >
                                    <div className="flex items-start gap-2">
                                        {!n.is_read && (
                                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                        )}
                                        <div className={cn("flex flex-col gap-0.5", n.is_read && "pl-4")}>
                                            <span className="font-medium leading-snug">{n.title}</span>
                                            <p className="text-muted-foreground leading-snug">{n.message}</p>
                                            <span className="text-xs text-muted-foreground mt-1">
                                                {format(new Date(n.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </PopoverContent>
        </Popover>
    )
}
