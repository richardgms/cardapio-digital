'use server'

import { withSuperAdmin } from '@/lib/auth-guards'
import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'

interface OptionValues {
    id?: string
    name: string
    price: number
    is_available: boolean
}

interface OptionGroupValues {
    id?: string
    title: string
    is_required: boolean
    pricing_mode: 'addon' | 'replacement'
    max_select: number
    options: OptionValues[]
}

export interface ProductSaveValues {
    name: string
    description?: string
    price: number
    category_id: string
    is_available: boolean
    allows_half_half: boolean
    image_url?: string | null
    additional_images?: string[]
    option_groups: OptionGroupValues[]
}

/**
 * Registra log de auditoria no DB sobre a ação de proxy
 */
async function recordAuditLog(
    adminClient: SupabaseClient, 
    adminId: string, 
    storeId: string, 
    actionType: string, 
    entityName: string, 
    payload: Record<string, unknown>
) {
    try {
        await adminClient.from('admin_impersonation_logs').insert({
            admin_id: adminId,
            target_store_id: storeId,
            action_type: actionType,
            entity_name: entityName,
            payload: payload
        })
    } catch (err) {
        console.error('Falha ao registrar log de auditoria [IGNORADO PARA NÃO TRAVAR O FLUXO]:', err)
    }
}

/**
 * Busca produtos de um lojista via proxy
 */
export async function fetchProductsForProxy(storeId: string) {
    return withSuperAdmin(async (adminClient) => {
        const { data, error } = await adminClient
            .from('products')
            .select(`
                *,
                categories (
                    name
                )
            `)
            .eq('store_id', storeId)
            .order('name')

        if (error) {
            console.error('[PROXY] Error fetching products:', error)
            throw new Error(`Erro ao buscar produtos via proxy: ${error.message}`)
        }

        return data
    })
}

/**
 * Exclui um produto via proxy
 */
export async function deleteProductAsProxy(storeId: string, productId: string) {
    return withSuperAdmin(async (adminClient, user) => {
        const { data, error } = await adminClient
            .from('products')
            .delete()
            .eq('id', productId)
            .eq('store_id', storeId)
            .select('id')
            .single()

        if (error || !data) {
            console.error('[PROXY] Error deleting product:', error)
            throw new Error(`Erro ao excluir: ${error?.message || 'Produto não encontrado'}`)
        }

        await recordAuditLog(adminClient, user.id, storeId, 'delete', 'products', { productId })
        revalidatePath(`/admin/super/lojista/${storeId}/produtos`)

        return { success: true }
    })
}

/**
 * Alterna a disponibilidade de um produto via proxy
 */
export async function toggleProductAvailabilityAsProxy(storeId: string, productId: string, isAvailable: boolean) {
    return withSuperAdmin(async (adminClient, user) => {
        const { data, error } = await adminClient
            .from('products')
            .update({ is_available: isAvailable })
            .eq('id', productId)
            .eq('store_id', storeId)
            .select('id')
            .single()

        if (error || !data) {
            console.error('[PROXY] Error toggling product:', error)
            throw new Error(`Erro ao atualizar: ${error?.message || 'Produto não encontrado'}`)
        }

        await recordAuditLog(adminClient, user.id, storeId, 'update_availability', 'products', { productId, isAvailable })
        revalidatePath(`/admin/super/lojista/${storeId}/produtos`)

        return { success: true }
    })
}

/**
 * Salva ou atualiza um produto via proxy (incluindo grupos e opções)
 */
export async function saveProductAsProxy(storeId: string, productId: string, values: ProductSaveValues) {
    return withSuperAdmin(async (adminClient, user) => {
        const productData = {
            store_id: storeId,
            name: values.name,
            description: values.description,
            price: values.price,
            category_id: values.category_id,
            is_available: values.is_available,
            allows_half_half: values.allows_half_half,
            image_url: values.image_url,
            additional_images: (values.additional_images || []).filter(Boolean),
        };

        let targetProductId = productId;

        // 1. Salvar/Atualizar Produto
        if (targetProductId === "novo") {
            const { data, error } = await adminClient
                .from("products")
                .insert(productData)
                .select()
                .single();
            if (error) throw error;
            targetProductId = data.id;
        } else {
            const { error } = await adminClient
                .from("products")
                .update(productData)
                .eq("id", targetProductId)
                .eq("store_id", storeId);
            if (error) throw error;
        }

        // 2. Sincronizar Grupos e Opções (Lógica de exclusão/atualização)
        const { data: rawGroups, error: fetchError } = await adminClient
            .from("product_option_groups")
            .select("id, options:product_options(id)")
            .eq("product_id", targetProductId);

        if (fetchError) throw fetchError;
        
        const existingGroups = (rawGroups || []) as { id: string, options: { id: string }[] }[];

        const formGroupIds = new Set(values.option_groups?.map(g => g.id).filter(Boolean));
        const formOptionIds = new Set(
            values.option_groups?.flatMap(g => g.options.map(o => o.id)).filter(Boolean)
        );

        const groupsToDelete = existingGroups.filter(g => !formGroupIds.has(g.id)).map(g => g.id);
        const allExistingOptionIds = existingGroups.flatMap(g => g.options?.map(o => o.id) || []);
        const optionsToDelete = (allExistingOptionIds as string[]).filter((id: string) => !formOptionIds.has(id));

        if (optionsToDelete.length > 0) {
            await adminClient.from("product_options").delete().in("id", optionsToDelete);
        }

        if (groupsToDelete.length > 0) {
            await adminClient.from("product_option_groups").delete().in("id", groupsToDelete);
        }

        // 3. Upsert Grupos e Opções
        if (values.option_groups) {
            for (const [gIndex, group] of values.option_groups.entries()) {
                const groupData = {
                    product_id: targetProductId,
                    title: group.title,
                    is_required: group.is_required,
                    max_select: group.pricing_mode === 'replacement' ? 1 : group.max_select,
                    pricing_mode: group.pricing_mode,
                    sort_order: gIndex,
                };

                let groupId = group.id;

                if (groupId) {
                    const { error: ugError } = await adminClient.from("product_option_groups").update(groupData).eq("id", groupId);
                    if (ugError) throw ugError;
                } else {
                    const { data: newGroup, error: igError } = await adminClient
                        .from("product_option_groups")
                        .insert(groupData)
                        .select()
                        .single();
                    if (igError) throw igError;
                    groupId = newGroup?.id;
                }

                if (!groupId) continue;

                if (group.options) {
                    const sortedOptions = [...group.options].sort((a, b) => {
                        const priceDiff = (a.price || 0) - (b.price || 0);
                        if (priceDiff !== 0) return priceDiff;
                        return a.name.localeCompare(b.name, 'pt-BR');
                    });

                    for (const [oIndex, option] of sortedOptions.entries()) {
                        const optionData = {
                            group_id: groupId,
                            name: option.name,
                            price: option.price,
                            sort_order: oIndex,
                            is_available: option.is_available !== false,
                        };

                        if (option.id) {
                            const { error: uoError } = await adminClient.from("product_options").update(optionData).eq("id", option.id);
                            if (uoError) throw uoError;
                        } else {
                            const { error: ioError } = await adminClient.from("product_options").insert(optionData);
                            if (ioError) throw ioError;
                        }
                    }
                }
            }
        }

        // Auditoria
        await recordAuditLog(adminClient, user.id, storeId, productId === 'novo' ? 'create' : 'update', 'products', { 
            productId: targetProductId,
            productName: values.name 
        });

        revalidatePath(`/admin/super/lojista/${storeId}/produtos`);
        revalidatePath(`/admin/super/lojista/${storeId}/produtos/${targetProductId}`);

        // DIAGNÓSTICO TEMPORÁRIO — verificar o que o banco tem após o save
        const { data: dbCheck } = await adminClient
            .from('product_options')
            .select('name, is_available')
            .in('group_id', (await adminClient
                .from('product_option_groups')
                .select('id')
                .eq('product_id', targetProductId)
            ).data?.map((g: any) => g.id) ?? []);

        const dbDebug = (dbCheck || []).map((o: any) => `${o.name}=${o.is_available}`).join(' | ');

        return { success: true, productId: targetProductId, _debug: dbDebug };
    });
}
