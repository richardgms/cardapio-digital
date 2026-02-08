'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteRestaurant } from '@/actions/admin/super-admin'
import { toast } from 'sonner'

interface DeleteRestaurantDialogProps {
    restaurantId: string
    restaurantName: string
}

export function DeleteRestaurantDialog({ restaurantId, restaurantName }: DeleteRestaurantDialogProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    async function handleDelete() {
        setIsLoading(true)
        try {
            await deleteRestaurant(restaurantId)
            toast.success("Restaurante excluído", {
                description: `O restaurante ${restaurantName} foi removido.`,
            })
            setOpen(false)
        } catch (error: any) {
            toast.error("Erro ao excluir", {
                description: error.message || "Ocorreu um erro ao tentar excluir o restaurante.",
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-red-600 rounded-md transition-colors"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Restaurante?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação excluirá permanentemente o restaurante <strong>{restaurantName}</strong>.
                        <br />
                        <span className="text-red-500 font-semibold mt-2 block">
                            Atenção: Se este restaurante tiver um usuário ativo, ele poderá perder o acesso.
                        </span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e: React.MouseEvent) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Excluindo...
                            </>
                        ) : (
                            "Sim, excluir"
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
