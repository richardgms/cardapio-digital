"use server"

import { createAdminClient } from '@/lib/supabase/admin'
import { loadPublicStore, PUBLIC_STORE_WITH_HOURS } from '@/lib/public-store'
import { cookies, headers } from 'next/headers'

/**
 * Get store by subdomain (for server components)
 * Uses the subdomain header set by middleware
 */
export async function getStoreBySubdomain() {
    const headersList = await headers()
    const subdomain = headersList.get('x-subdomain')

    if (!subdomain) {
        // Fallback: try to get from cookies
        const cookieStore = await cookies()
        const subdomainCookie = cookieStore.get('subdomain')?.value

        if (!subdomainCookie) {
            return null
        }

        return fetchStoreBySubdomain(subdomainCookie)
    }

    return fetchStoreBySubdomain(subdomain)
}

/**
 * Internal function to fetch store from database
 */
async function fetchStoreBySubdomain(subdomain: string) {
    return loadPublicStore(subdomain, async slug => {
        const supabase = await createAdminClient();
        const { data, error } = await supabase.from('store_config')
            .select(PUBLIC_STORE_WITH_HOURS).eq('subdomain', slug).maybeSingle();
        if (error) return null;
        return data;
    });
}

/** Leitura pública limitada; não retorna identidade administrativa ou campos futuros. */
export async function getPublicStoreBySubdomain(subdomain: string) {
    return fetchStoreBySubdomain(subdomain);
}

/**
 * Get subdomain from cookies (for client components)
 */
export async function getSubdomainFromCookies(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('subdomain')?.value || null
}
