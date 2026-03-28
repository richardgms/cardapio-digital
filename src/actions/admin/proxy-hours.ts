'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Schemas de validação
 */
const PeriodSchema = z.object({
    open_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    close_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
})

const DayConfigSchema = z.object({
    day_of_week: z.number().min(0).max(6),
    is_open: z.boolean(),
    periods: z.array(PeriodSchema)
})

const HoursUpdateSchema = z.object({
    auto_schedule_enabled: z.boolean(),
    days: z.array(DayConfigSchema)
})

/**
 * Registra log de auditoria
 */
async function recordAuditLog(adminClient: any, adminId: string, storeId: string, actionType: string, entityName: string, payload: any) {
    try {
        await adminClient.from('admin_impersonation_logs').insert({
            admin_id: adminId,
            target_store_id: storeId,
            action_type: actionType,
            entity_name: entityName,
            payload: payload
        })
    } catch (err) {
        console.error('Falha ao registrar log de auditoria [IGNORADO]:', err)
    }
}

/**
 * Salva horários de funcionamento via proxy
 */
export async function saveBusinessHoursAsProxy(storeId: string, data: z.infer<typeof HoursUpdateSchema>) {
    return withSuperAdmin(async (adminClient, user) => {
        const validated = HoursUpdateSchema.parse(data)

        // 1. Atualizar Configuração da Loja (Modo Auto)
        const { error: configError } = await adminClient
            .from('store_config')
            .update({ auto_schedule_enabled: validated.auto_schedule_enabled })
            .eq('id', storeId)

        if (configError) throw configError

        // 2. Processar cada dia
        for (const day of validated.days) {
            // Upsert Business Hour para o dia
            const { data: hourData, error: hourError } = await adminClient
                .from('business_hours')
                .upsert({
                    store_config_id: storeId,
                    day_of_week: day.day_of_week,
                    is_open: day.is_open
                }, { onConflict: 'store_config_id,day_of_week' })
                .select('id')
                .single()

            if (hourError) throw hourError
            const hourId = hourData.id

            // Limpar períodos antigos deste dia
            const { error: deleteError } = await adminClient
                .from('business_hour_periods')
                .delete()
                .eq('business_hour_id', hourId)

            if (deleteError) throw deleteError

            // Inserir novos períodos se estiver aberto
            if (day.is_open && day.periods.length > 0) {
                const periodsToInsert = day.periods.map((p, idx) => ({
                    business_hour_id: hourId,
                    open_time: p.open_time,
                    close_time: p.close_time,
                    sort_order: idx
                }))

                const { error: periodsError } = await adminClient
                    .from('business_hour_periods')
                    .insert(periodsToInsert)

                if (periodsError) throw periodsError
            }
        }

        await recordAuditLog(adminClient, user.id, storeId, 'update', 'business_hours', { auto_enabled: validated.auto_schedule_enabled })
        revalidatePath(`/admin/super/lojista/${storeId}/horarios`)
        return { success: true }
    })
}
