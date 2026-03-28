import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({ storeName }: { storeName: string }) {
    return (
        <div className="bg-white text-zinc-950 px-4 py-3 flex items-center justify-between border-b z-50 sticky top-0 -mx-4 -mt-2 mb-6">
            <div className="flex items-center gap-3 font-medium">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span>
                    MODO SIMULADOR ATIVO: Você está editando o cardápio da loja <strong className="uppercase bg-zinc-100 px-2 py-0.5 rounded ml-1 font-bold">{storeName}</strong>
                </span>
            </div>
            <Link href="/admin/super">
                <Button variant="outline" size="sm" className="font-semibold border-zinc-200">
                    Sair do Simulador
                </Button>
            </Link>
        </div>
    );
}
