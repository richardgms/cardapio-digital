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
import { updateRestaurant } from "@/actions/admin/super-admin"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"

interface EditRestaurantDialogProps {
    restaurant: {
        id: string
        name: string
        subdomain: string | null
        admin_email: string
    }
}

export function EditRestaurantDialog({ restaurant }: EditRestaurantDialogProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [name, setName] = useState(restaurant.name)
    const [subdomain, setSubdomain] = useState(restaurant.subdomain || "")

    // Reset form when dialog opens/closes
    useEffect(() => {
        if (open) {
            setName(restaurant.name)
            setSubdomain(restaurant.subdomain || "")
            setError("")
        }
    }, [open, restaurant])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        setError("")

        try {
            await updateRestaurant({
                id: restaurant.id,
                name,
                subdomain: subdomain.toLowerCase()
            })
            toast.success("Restaurante atualizado com sucesso!")
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
                <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Editar Restaurante</DialogTitle>
                    <DialogDescription>
                        Alterar detalhes do restaurante. Cuidado ao mudar o subdomínio.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="email" className="text-right">
                                Email
                            </Label>
                            <Input
                                id="email"
                                value={restaurant.admin_email}
                                disabled
                                className="col-span-3 bg-muted"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Nome
                            </Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="col-span-3"
                                required
                                minLength={3}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="subdomain" className="text-right">
                                Subdomínio
                            </Label>
                            <div className="col-span-3 flex items-center gap-2">
                                <Input
                                    id="subdomain"
                                    value={subdomain}
                                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    className="flex-1"
                                    required
                                    minLength={3}
                                    maxLength={30}
                                    pattern="[a-z0-9-]+"
                                />
                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    .app
                                </span>
                            </div>
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
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
