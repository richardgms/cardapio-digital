"use client"

import { useState } from "react"
import {
    fetchAllNotifications,
    createNotification,
    toggleNotificationStatus,
    deleteNotification,
    type NotificationFormData,
} from "@/actions/admin/notifications"
import type { Notification } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Plus, Trash2, Bell } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useEffect } from "react"

export function NotificationManager() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState<NotificationFormData>({ title: "", message: "" })

    useEffect(() => { load() }, [])

    async function load() {
        try {
            setLoading(true)
            setNotifications(await fetchAllNotifications())
        } catch {
            toast.error("Erro ao carregar notificações")
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            await createNotification(formData)
            toast.success("Notificação criada e disparada!")
            setIsDialogOpen(false)
            setFormData({ title: "", message: "" })
            load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao criar notificação")
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleToggle(n: Notification) {
        try {
            await toggleNotificationStatus(n.id, !n.is_active)
            toast.success(`Notificação ${n.is_active ? "desativada" : "ativada"}!`)
            load()
        } catch {
            toast.error("Erro ao alterar status")
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir esta notificação?")) return
        try {
            await deleteNotification(id)
            toast.success("Notificação excluída!")
            load()
        } catch {
            toast.error("Erro ao excluir")
        }
    }

    if (loading) {
        return (
            <Card>
                <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notificações
                </CardTitle>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => setFormData({ title: "", message: "" })}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Notificação
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Criar Notificação</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                            <div className="space-y-2">
                                <Label htmlFor="title">Título *</Label>
                                <Input
                                    id="title"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Ex: Nova funcionalidade disponível!"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="message">Mensagem *</Label>
                                <Textarea
                                    id="message"
                                    value={formData.message}
                                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                                    placeholder="Descreva a novidade ou informação importante..."
                                    rows={4}
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Disparando..." : "Criar e Disparar"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {notifications.length === 0 ? (
                    <div className="text-center py-12">
                        <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma notificação criada</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Crie notificações para comunicar novidades aos restaurantes
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Título</TableHead>
                                <TableHead>Mensagem</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {notifications.map(n => (
                                <TableRow key={n.id}>
                                    <TableCell className="font-medium">{n.title}</TableCell>
                                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                                        {n.message}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                        {format(new Date(n.created_at), "d MMM yyyy", { locale: ptBR })}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={n.is_active ? "default" : "secondary"}>
                                            {n.is_active ? "Ativa" : "Inativa"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Switch
                                                checked={n.is_active}
                                                onCheckedChange={() => handleToggle(n)}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(n.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
