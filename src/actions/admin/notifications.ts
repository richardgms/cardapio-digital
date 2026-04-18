'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Notification } from '@/types/database'

const SUPER_ADMIN_EMAIL = 'richardgms001@gmail.com'

export interface NotificationFormData {
    title: string
    message: string
    is_active?: boolean
}

export async function fetchNotificationsWithReadStatus(): Promise<(Notification & { is_read: boolean })[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (!notifications?.length) return []

    const { data: reads } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('store_id', user.id)
        .in('notification_id', notifications.map(n => n.id))

    const readIds = new Set(reads?.map(r => r.notification_id) ?? [])

    return notifications.map(n => ({ ...n, is_read: readIds.has(n.id) }))
}

export async function markAllNotificationsRead(notificationIds: string[]): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data: existing } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('store_id', user.id)
        .in('notification_id', notificationIds)

    const existingIds = new Set(existing?.map(r => r.notification_id) ?? [])
    const toInsert = notificationIds
        .filter(id => !existingIds.has(id))
        .map(id => ({ notification_id: id, store_id: user.id }))

    if (toInsert.length > 0) {
        await supabase.from('notification_reads').insert(toInsert)
    }
}

// Super admin only
export async function fetchAllNotifications(): Promise<Notification[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email !== SUPER_ADMIN_EMAIL) throw new Error('Acesso negado')

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) throw new Error('Erro ao buscar notificações')
    return data ?? []
}

export async function createNotification(formData: NotificationFormData): Promise<Notification> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email !== SUPER_ADMIN_EMAIL) throw new Error('Acesso negado')

    if (!formData.title.trim()) throw new Error('Título é obrigatório')
    if (!formData.message.trim()) throw new Error('Mensagem é obrigatória')

    const { data, error } = await supabase
        .from('notifications')
        .insert({ title: formData.title.trim(), message: formData.message.trim(), is_active: true })
        .select()
        .single()

    if (error) throw new Error('Erro ao criar notificação')
    revalidatePath('/admin/super')
    return data
}

export async function toggleNotificationStatus(id: string, isActive: boolean): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email !== SUPER_ADMIN_EMAIL) throw new Error('Acesso negado')

    const { error } = await supabase
        .from('notifications')
        .update({ is_active: isActive })
        .eq('id', id)

    if (error) throw new Error('Erro ao atualizar notificação')
    revalidatePath('/admin/super')
}

export async function deleteNotification(id: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email !== SUPER_ADMIN_EMAIL) throw new Error('Acesso negado')

    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) throw new Error('Erro ao excluir notificação')
    revalidatePath('/admin/super')
}
