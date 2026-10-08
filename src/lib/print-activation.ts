type ActivationEnvironment = {
    RMENU_PRINT_AGENT_ENABLED?: string;
    RMENU_PRINT_ACTIVATION_READY?: string;
    RMENU_PRINT_ACTIVATION_STORE_IDS?: string;
};

const storeIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPrintActivationReadyForStore(
    storeId: string | null | undefined,
    environment: ActivationEnvironment = {
        RMENU_PRINT_AGENT_ENABLED: process.env.RMENU_PRINT_AGENT_ENABLED,
        RMENU_PRINT_ACTIVATION_READY: process.env.RMENU_PRINT_ACTIVATION_READY,
        RMENU_PRINT_ACTIVATION_STORE_IDS: process.env.RMENU_PRINT_ACTIVATION_STORE_IDS,
    },
) {
    if (environment.RMENU_PRINT_AGENT_ENABLED !== '1' || environment.RMENU_PRINT_ACTIVATION_READY !== '1') return false;
    if (!storeId || !storeIdPattern.test(storeId)) return false;
    const allowedStores = environment.RMENU_PRINT_ACTIVATION_STORE_IDS?.split(',').map(id => id.trim()) ?? [];
    // A missing or invalid rollout list never releases every restaurant.
    if (!allowedStores.length || allowedStores.some(id => !storeIdPattern.test(id))) return false;
    return allowedStores.some(id => id.toLowerCase() === storeId.toLowerCase());
}
