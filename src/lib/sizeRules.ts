import type { ProductOptionGroup } from '@/types/database'

/**
 * Returns the effective max_select for a group given the currently selected sizes.
 *
 * Priority:
 * 1. If a replacement group has a selected option and that option has a matching
 *    GroupSizeRule on this group → return rule.max_select
 * 2. Otherwise → return group.max_select (fallback)
 */
export function getEffectiveMaxSelect(
    group: ProductOptionGroup,
    selectedOptionsByGroupId: Record<string, string[]>,
    replacementGroups: ProductOptionGroup[]
): number {
    for (const replacementGroup of replacementGroups) {
        const selectedSizeOptionId = selectedOptionsByGroupId[replacementGroup.id]?.[0]
        if (!selectedSizeOptionId) continue

        const rule = group.size_rules?.find(r => r.size_option_id === selectedSizeOptionId)
        if (rule) return rule.max_select
    }

    return group.max_select
}
