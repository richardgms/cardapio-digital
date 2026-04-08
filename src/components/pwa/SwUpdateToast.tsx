"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export function SwUpdateToast() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return

        let reloadPending = false

        // When a new SW takes control → reload to get fresh assets
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (reloadPending) window.location.reload()
        })

        function promptUpdate(reg: ServiceWorkerRegistration) {
            const waiting = reg.waiting
            if (!waiting) return

            toast("Nova versão disponível", {
                description: "O app foi atualizado. Recarregue para continuar.",
                duration: Infinity,
                action: {
                    label: "Recarregar",
                    onClick: () => {
                        reloadPending = true
                        waiting.postMessage({ type: "SKIP_WAITING" })
                    },
                },
            })
        }

        navigator.serviceWorker.getRegistration().then((reg) => {
            if (!reg) return

            // SW já estava esperando quando a página abriu
            if (reg.waiting) {
                promptUpdate(reg)
                return
            }

            // Novo SW encontrado enquanto o usuário está na página
            reg.addEventListener("updatefound", () => {
                const installing = reg.installing
                if (!installing) return

                installing.addEventListener("statechange", () => {
                    if (
                        installing.state === "installed" &&
                        navigator.serviceWorker.controller
                    ) {
                        promptUpdate(reg)
                    }
                })
            })
        })
    }, [])

    return null
}
