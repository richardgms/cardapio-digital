"use client"

import { useEffect } from "react"
import { toast } from "sonner"

const TOAST_ID = "sw-update"
const CHECKOUT_LOCK_KEY = "__rmenu_checkout_active__"

/**
 * Marca/desmarca que há um checkout em andamento. Enquanto ativo, o
 * SwUpdateToast NÃO força reload — apenas adia até o lock liberar.
 */
export function setCheckoutLock(active: boolean): void {
    if (typeof window === "undefined") return
    if (active) {
        ;(window as unknown as Record<string, unknown>)[CHECKOUT_LOCK_KEY] = true
    } else {
        delete (window as unknown as Record<string, unknown>)[CHECKOUT_LOCK_KEY]
    }
}

function isCheckoutActive(): boolean {
    if (typeof window === "undefined") return false
    return Boolean((window as unknown as Record<string, unknown>)[CHECKOUT_LOCK_KEY])
}

export function SwUpdateToast() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return

        let reloadPending = false
        let reloadTimer: ReturnType<typeof setTimeout> | null = null
        let deferredReload = false

        function reloadNow() {
            if (reloadTimer) {
                clearTimeout(reloadTimer)
                reloadTimer = null
            }
            if (isCheckoutActive()) {
                deferredReload = true
                return
            }
            window.location.reload()
        }

        function activate(waiting: ServiceWorker) {
            reloadPending = true
            waiting.postMessage({ type: "SKIP_WAITING" })
            reloadTimer = setTimeout(reloadNow, 3000)
        }

        const onControllerChange = () => {
            if (reloadPending) reloadNow()
        }
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

        function promptUpdate(waiting: ServiceWorker) {
            toast("Nova versão disponível", {
                id: TOAST_ID,
                description: "O app foi atualizado. Recarregue para continuar.",
                duration: Infinity,
                action: {
                    label: "Recarregar",
                    onClick: () => activate(waiting),
                },
            })
        }

        navigator.serviceWorker.getRegistration().then((reg) => {
            if (!reg) return

            // Força um update check no mount — ajuda clientes com SW velho a
            // pegarem o novo SW (com skipWaiting:false) na próxima visita.
            reg.update().catch(() => undefined)

            if (reg.waiting) {
                promptUpdate(reg.waiting)
                return
            }

            reg.addEventListener("updatefound", () => {
                const installing = reg.installing
                if (!installing) return

                installing.addEventListener("statechange", () => {
                    if (
                        installing.state === "installed" &&
                        navigator.serviceWorker.controller
                    ) {
                        if (reg.waiting) promptUpdate(reg.waiting)
                    }
                })
            })
        })

        // Quando o lock libera, se havia reload adiado, executa.
        const onWindowFocus = () => {
            if (deferredReload && !isCheckoutActive()) {
                deferredReload = false
                window.location.reload()
            }
        }
        window.addEventListener("focus", onWindowFocus)

        return () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
            window.removeEventListener("focus", onWindowFocus)
            if (reloadTimer) clearTimeout(reloadTimer)
        }
    }, [])

    return null
}
