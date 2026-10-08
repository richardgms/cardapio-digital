import { z } from 'zod';
import type { BusinessHour, PublicStoreConfig } from '@/types/database';

export const PUBLIC_STORE_COLUMNS = 'id,name,whatsapp,address,is_open,minimum_order,logo_url,cover_url,auto_schedule_enabled,subdomain,pix_key,pix_key_type,table_mode_available,table_mode_enabled,table_count,accept_pix,accept_cash,accept_card';
export const PUBLIC_STORE_WITH_HOURS = `${PUBLIC_STORE_COLUMNS},business_hours(id,store_config_id,day_of_week,is_open,periods:business_hour_periods(id,business_hour_id,open_time,close_time,sort_order))`;

export type PublicStoreWithHours = PublicStoreConfig & { business_hours: BusinessHour[] };
const period = z.object({ id:z.uuid(),business_hour_id:z.uuid(),open_time:z.string(),close_time:z.string(),sort_order:z.number().int() });
const hour = z.object({ id:z.uuid(),store_config_id:z.uuid(),day_of_week:z.number().int().min(0).max(6),is_open:z.boolean(),periods:z.array(period).default([]) });
const publicStore = z.object({
    id:z.uuid(),name:z.string(),whatsapp:z.string(),address:z.string().nullable(),is_open:z.boolean(),
    minimum_order:z.number().finite().nonnegative(),logo_url:z.string().nullable(),cover_url:z.string().nullable(),
    auto_schedule_enabled:z.boolean(),subdomain:z.string().nullable(),pix_key:z.string().nullable(),
    pix_key_type:z.enum(['cpf','cnpj','email','phone','random']).nullable(),
    table_mode_available:z.boolean(),table_mode_enabled:z.boolean(),table_count:z.number().int(),
    accept_pix:z.boolean().nullable(),accept_cash:z.boolean().nullable(),accept_card:z.boolean().nullable(),
    business_hours:z.array(hour).default([]),
});

export function validPublicSubdomain(input: unknown): input is string {
    return typeof input==='string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input) && input!=='www';
}

// Segunda barreira: campos extras do SDK nunca atravessam a resposta pública.
export function projectPublicStore(input: unknown): PublicStoreWithHours | null {
    const parsed=publicStore.safeParse(input);
    return parsed.success ? parsed.data : null;
}

export async function loadPublicStore(input: unknown, read: (subdomain:string)=>Promise<unknown>): Promise<PublicStoreWithHours|null> {
    if (!validPublicSubdomain(input)) return null;
    try { return projectPublicStore(await read(input)); }
    catch { return null; }
}
