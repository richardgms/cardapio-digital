"use server"

import { createClient } from '@/lib/supabase/server'
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
    const supabase = await createClient()

    const { data: store, error } = await supabase
        .from('store_config')
        .select(`
            *,
            business_hours (
                *,
                periods:business_hour_periods (*)
            )
        `)
        .eq('subdomain', subdomain)
        .single()

    if (error || !store) {
        console.error('Store not found for subdomain:', subdomain, error)
        return null
    }

    return store
}

/**
 * Get subdomain from cookies (for client components)
 */
export async function getSubdomainFromCookies(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('subdomain')?.value || null
}
