"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
    Store,
    Package,
    XCircle,
    Folder,
    MapPin,
    ExternalLink,
    QrCode,
    Download,
    Clock
} from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";

export default function AdminDashboard() {
    const { store, fetchStore, setStore, isCurrentlyOpen } = useStore();
    const [metrics, setMetrics] = useState({
        products: 0,
        outOfStock: 0,
        categories: 0,
        activeZones: 0,
    });
    const [loadingMetrics, setLoadingMetrics] = useState(true);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

    useEffect(() => {
        async function getMetrics() {
            try {
                const supabase = createClient();

                // Get current user for filtering
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const [
                    { count: productsCount },
                    { count: outOfStockCount },
                    { count: categoriesCount },
                    { count: zonesCount },
                ] = await Promise.all([
                    supabase.from("products").select("*", { count: "exact", head: true }).eq("store_id", user.id),
                    supabase.from("products").select("*", { count: "exact", head: true }).eq("store_id", user.id).eq("is_available", false),
                    supabase.from("categories").select("*", { count: "exact", head: true }).eq("store_id", user.id),
                    supabase.from("delivery_zones").select("*", { count: "exact", head: true }).eq("store_id", user.id).eq("is_active", true),
                ]);

                setMetrics({
                    products: productsCount || 0,
                    outOfStock: outOfStockCount || 0,
                    categories: categoriesCount || 0,
                    activeZones: zonesCount || 0,
                });
            } catch (error) {
                console.error("Erro ao buscar métricas:", error);
                toast.error("Erro ao carregar métricas");
            } finally {
                setLoadingMetrics(false);
            }
        }

        getMetrics();
    }, []);

    const handleToggleStore = async (checked: boolean) => {
        try {
            if (!store) return;

            // Optimistic update (or manual update after success)
            // Updating local state immediately to ensure UI responsiveness
            const oldStore = { ...store };
            const newStore = { ...store, is_open: checked };

            // 1. Update local state immediately (Optimistic)
            setStore(newStore);

            const supabase = createClient();
            const { error } = await supabase
                .from("store_config")
                .update({ is_open: checked })
                .eq("id", store.id);

            if (error) {
                // Revert on error
                setStore(oldStore);
                throw error;
            }

            // 2. Fetch to confirm (optional, but good for consistency)
            // await fetchStore(); 
            // Commenting out fetchStore to avoid race condition where fetch returns old data 
            // because we already updated locally.

            toast.success(checked ? "Loja aberta com sucesso!" : "Loja fechada com sucesso!");
        } catch (error) {
            console.error("Erro ao atualizar loja:", error);
            toast.error("Erro ao atualizar status da loja");
        }
    };

    const generateQrCode = async () => {
        try {
            const url = window.location.origin;
            const qrC = await QRCode.toDataURL(url, { width: 300, margin: 2 });
            setQrCodeUrl(qrC);
        } catch (err) {
            console.error(err);
            toast.error("Erro ao gerar QR Code");
        }
    };

    const downloadQrCode = () => {
        if (!qrCodeUrl) return;
        const link = document.createElement("a");
        link.href = qrCodeUrl;
        link.download = "cardapio-qr-code.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };



    const isOpen = store?.auto_schedule_enabled ? isCurrentlyOpen : store?.is_open;
    const statusText = isOpen ? "LOJA ABERTA" : "LOJA FECHADA";
    const statusSubtext = store?.auto_schedule_enabled ? "(Automático)" : "";

    // Calculate description
    let statusDescription = store?.is_open
        ? "Sua loja está visível e aceitando pedidos."
        : "Seus clientes verão um aviso de loja fechada.";

    if (store?.auto_schedule_enabled) {
        if (isOpen) {
            const now = new Date();
            const brasiliaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
            const currentDay = brasiliaTime.getDay();
            const hours = brasiliaTime.getHours().toString().padStart(2, '0');
            const minutes = brasiliaTime.getMinutes().toString().padStart(2, '0');
            const currentTime = `${hours}:${minutes}`;

            const todayConfig = store.business_hours?.find(bh => bh.day_of_week === currentDay);
            const currentPeriod = todayConfig?.periods?.find(p => {
                const start = p.open_time.slice(0, 5);
                const end = p.close_time.slice(0, 5);
                return currentTime >= start && currentTime <= end;
            });

            if (currentPeriod) {
                statusDescription = `Fecha às ${currentPeriod.close_time.slice(0, 5)}`;
            } else {
                statusDescription = "Horário Automático Ativo";
            }
        } else {
            statusDescription = "Fora do horário de funcionamento.";
        }
    }

    const handleViewMenu = () => {
        if (!store?.subdomain) {
            toast.error("Você precisa definir um subdomínio nas Configurações da Loja primeiro.");
            return;
        }

        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
        const protocol = window.location.protocol;
        const url = `${protocol}//${store.subdomain}.${rootDomain}`;

        window.open(url, "_blank");
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            </div>

            {/* Switch de Status da Loja */}
            <Card className={`border-l-4 ${isOpen ? "border-l-green-500" : "border-l-red-500"}`}>
                <CardContent className="flex items-center justify-between p-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h2 className={`text-2xl font-bold ${isOpen ? "text-green-600" : "text-red-600"}`}>
                                {statusText} {statusSubtext}
                            </h2>
                        </div>

                        {store?.auto_schedule_enabled ? (
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    <span>{statusDescription}</span>
                                </div>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-muted-foreground underline justify-start font-normal text-xs"
                                    onClick={() => window.location.href = '/admin/horarios'}
                                >
                                    Configurar horários
                                </Button>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {statusDescription}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4 pl-4">
                        <Switch
                            checked={!!store?.is_open}
                            disabled={!!store?.auto_schedule_enabled}
                            onCheckedChange={handleToggleStore}
                            className="scale-125 origin-center data-[state=checked]:bg-green-500"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Grid de Métricas */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Link href="/admin/produtos">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total de Produtos</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            {loadingMetrics ? (
                                <Skeleton className="h-7 w-20" />
                            ) : (
                                <div className="text-2xl font-bold">{metrics.products}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Itens cadastrados</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/admin/produtos">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Produtos Esgotados</CardTitle>
                            <XCircle className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            {loadingMetrics ? (
                                <Skeleton className="h-7 w-20" />
                            ) : (
                                <div className="text-2xl font-bold">{metrics.outOfStock}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Itens indisponíveis</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/admin/categorias">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Categorias</CardTitle>
                            <Folder className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            {loadingMetrics ? (
                                <Skeleton className="h-7 w-20" />
                            ) : (
                                <div className="text-2xl font-bold">{metrics.categories}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Categorias ativas</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/admin/zonas">
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Zonas Ativas</CardTitle>
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            {loadingMetrics ? (
                                <Skeleton className="h-7 w-20" />
                            ) : (
                                <div className="text-2xl font-bold">{metrics.activeZones}</div>
                            )}
                            <p className="text-xs text-muted-foreground">Locais de entrega</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Ações Rápidas */}
            <h3 className="text-lg font-semibold mt-4">Ações Rápidas</h3>
            <div className="flex gap-4">
                <Button
                    variant="outline"
                    className="h-24 w-40 flex flex-col gap-2"
                    onClick={handleViewMenu}
                >
                    <ExternalLink className="h-6 w-6" />
                    Ver Cardápio
                </Button>

                <Dialog onOpenChange={(open) => open && generateQrCode()}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="h-24 w-40 flex flex-col gap-2">
                            <QrCode className="h-6 w-6" />
                            Gerar QR Code
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>QR Code da Loja</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col items-center justify-center p-6 space-y-4">
                            {qrCodeUrl ? (
                                <img src={qrCodeUrl} alt="QR Code" width={300} height={300} className="border rounded-lg" />
                            ) : (
                                <Skeleton className="h-[300px] w-[300px]" />
                            )}
                            <Button onClick={downloadQrCode} className="w-full">
                                <Download className="mr-2 h-4 w-4" />
                                Baixar PNG
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
