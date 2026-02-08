"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createUser } from "@/actions/admin/super-admin"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

/**
 * Convert restaurant name to valid subdomain
 * Example: "NutriBox Refeições" -> "nutribox-refeicoes"
 */
function toSubdomain(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
        .replace(/\s+/g, "-") // Spaces to hyphens
        .replace(/-+/g, "-") // Remove multiple hyphens
        .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
        .substring(0, 30) // Max 30 chars
}

export function CreateUserDialog() {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [restaurantName, setRestaurantName] = useState("")
    const [subdomain, setSubdomain] = useState("")
    const [subdomainEdited, setSubdomainEdited] = useState(false)

    // Auto-generate subdomain from restaurant name (if not manually edited)
    useEffect(() => {
        if (!subdomainEdited && restaurantName) {
            setSubdomain(toSubdomain(restaurantName))
        }
    }, [restaurantName, subdomainEdited])

    // Reset form when dialog closes
    useEffect(() => {
        if (!open) {
            setRestaurantName("")
            setSubdomain("")
            setSubdomainEdited(false)
            setError("")
        }
    }, [open])

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError("")

        const email = formData.get("email") as string
        const whatsapp = formData.get("whatsapp") as string

        try {
            await createUser({
                email,
                restaurantName,
                whatsapp,
                subdomain: subdomain.toLowerCase()
            })
            toast.success("Restaurante criado!", {
                description: `${restaurantName} está pronto em ${subdomain}.seudominio.app`
            })
            setOpen(false)
        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("Ocorreu um erro desconhecido.")
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Restaurante
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Criar Novo Restaurante</DialogTitle>
                    <DialogDescription>
                        O usuário receberá acesso via Magic Link (Email).
                    </DialogDescription>
                </DialogHeader>
                <form action={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="email" className="text-right">
                                Email
                            </Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="restaurante@exemplo.com"
                                className="col-span-3"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="restaurantName" className="text-right">
                                Restaurante
                            </Label>
                            <Input
                                id="restaurantName"
                                name="restaurantName"
                                placeholder="Nome do Restaurante"
                                className="col-span-3"
                                required
                                minLength={3}
                                value={restaurantName}
                                onChange={(e) => setRestaurantName(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="subdomain" className="text-right">
                                Subdomínio
                            </Label>
                            <div className="col-span-3 flex items-center gap-2">
                                <Input
                                    id="subdomain"
                                    name="subdomain"
                                    placeholder="meu-restaurante"
                                    className="flex-1"
                                    required
                                    minLength={3}
                                    maxLength={30}
                                    pattern="[a-z0-9-]+"
                                    value={subdomain}
                                    onChange={(e) => {
                                        setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                                        setSubdomainEdited(true)
                                    }}
                                />
                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    .app
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="whatsapp" className="text-right">
                                WhatsApp
                            </Label>
                            <Input
                                id="whatsapp"
                                name="whatsapp"
                                placeholder="11999999999"
                                className="col-span-3"
                                required
                                minLength={10}
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-red-500 text-center">
                                {error}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar Restaurante
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

