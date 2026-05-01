/**
 * localStorage wrapper que cai pra Map em memória quando o storage está
 * indisponível (Safari modo privado, quota excedida, ITP).
 *
 * Usa boot-time probe — uma única tentativa de write/read pra detectar
 * disponibilidade. Se falhar, todas as chamadas subsequentes operam em
 * memória sem lançar.
 */

let storageAvailable: boolean | null = null
const memoryStore = new Map<string, string>()

function probe(): boolean {
    if (storageAvailable !== null) return storageAvailable
    if (typeof window === 'undefined') {
        storageAvailable = false
        return false
    }
    try {
        const probeKey = '__rmenu_probe__'
        window.localStorage.setItem(probeKey, '1')
        window.localStorage.removeItem(probeKey)
        storageAvailable = true
    } catch {
        storageAvailable = false
    }
    return storageAvailable
}

export const safeStorage = {
    isAvailable(): boolean {
        return probe()
    },

    getItem(key: string): string | null {
        if (probe()) {
            try {
                return window.localStorage.getItem(key)
            } catch {
                return memoryStore.get(key) ?? null
            }
        }
        return memoryStore.get(key) ?? null
    },

    setItem(key: string, value: string): void {
        if (probe()) {
            try {
                window.localStorage.setItem(key, value)
                return
            } catch {
                storageAvailable = false
            }
        }
        memoryStore.set(key, value)
    },

    removeItem(key: string): void {
        if (probe()) {
            try {
                window.localStorage.removeItem(key)
                return
            } catch {
                // fall through
            }
        }
        memoryStore.delete(key)
    },
}

/**
 * Adapter compatível com a API esperada pelo `createJSONStorage` do Zustand persist.
 */
export const safeJSONStorageAdapter = {
    getItem: (name: string): string | null => safeStorage.getItem(name),
    setItem: (name: string, value: string): void => safeStorage.setItem(name, value),
    removeItem: (name: string): void => safeStorage.removeItem(name),
}
