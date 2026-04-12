"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Upload, X, Loader2, Image as ImageIcon, RefreshCw, Pencil, Camera, Trash2 } from "lucide-react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageCropModal } from "./ImageCropModal";

interface ImageUploadProps {
    value?: string | null;
    onChange: (url: string | null) => void;
    disabled?: boolean;
    className?: string;
    compact?: boolean;
    replaceable?: boolean;
    /** Renders as a small clickable square with no label or separate button below */
    inline?: boolean;
}

export function ImageUpload({ value, onChange, disabled, className, compact, replaceable, inline }: ImageUploadProps) {
    const [loading, setLoading] = useState(false);
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
    const [actionMenuOpen, setActionMenuOpen] = useState(false);
    const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    useEffect(() => {
        setIsTouchDevice(window.matchMedia("(hover: none)").matches);
    }, []);

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Read the file into a data URL for the crop modal
        const reader = new FileReader();
        reader.onload = () => {
            setRawImageSrc(reader.result as string);
            setCropModalOpen(true);
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected
        e.target.value = "";
    };

    const handleCropConfirm = async (croppedBlob: Blob) => {
        setCropModalOpen(false);
        setRawImageSrc(null);
        setLoading(true);

        try {
            // Convert Blob to File for compression
            const croppedFile = new File([croppedBlob], "cropped.jpg", {
                type: "image/jpeg",
            });

            // Compress image
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 800,
                useWebWorker: true,
            };
            const compressedFile = await imageCompression(croppedFile, options);

            // Create unique filename
            const fileName = `${Math.random()}.jpg`;
            const filePath = `${fileName}`;

            // Upload to Supabase
            const { error: uploadError } = await supabase.storage
                .from("images")
                .upload(filePath, compressedFile);

            if (uploadError) {
                throw uploadError;
            }

            // Get Public URL
            const { data } = supabase.storage
                .from("images")
                .getPublicUrl(filePath);

            onChange(data.publicUrl);
            toast.success("Imagem enviada com sucesso!");
        } catch (error) {
            console.error("Erro no upload:", error);
            toast.error("Erro ao enviar imagem");
        } finally {
            setLoading(false);
        }
    };

    const handleCropCancel = () => {
        setCropModalOpen(false);
        setRawImageSrc(null);
    };

    const removeImage = () => {
        onChange(null);
    };

    const openFileSource = () => {
        if (isTouchDevice) {
            setSourceMenuOpen(true);
        } else {
            galleryInputRef.current?.click();
        }
    };

    const cropModal = (
        <ImageCropModal
            open={cropModalOpen}
            imageSrc={rawImageSrc ?? ""}
            onConfirm={handleCropConfirm}
            onCancel={handleCropCancel}
            aspectRatio={1}
        />
    );

    if (inline) {
        return (
            <div className={cn("relative shrink-0", className)}>
                {cropModal}

                {/* Inputs ocultos para câmera e galeria */}
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onFileSelect}
                    disabled={disabled || loading}
                />
                <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onFileSelect}
                    disabled={disabled || loading}
                />

                {/* Dialog: Trocar ou Excluir */}
                <Dialog open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
                    <DialogContent className="max-w-[280px] gap-0 overflow-hidden p-0">
                        <DialogTitle className="sr-only">Opções da imagem</DialogTitle>
                        <button
                            type="button"
                            onClick={() => { setActionMenuOpen(false); openFileSource(); }}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium hover:bg-muted active:bg-muted"
                        >
                            <RefreshCw className="h-4 w-4 text-muted-foreground" />
                            Trocar imagem
                        </button>
                        <Separator />
                        <button
                            type="button"
                            onClick={() => { removeImage(); setActionMenuOpen(false); }}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium text-destructive hover:bg-destructive/10 active:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                        </button>
                    </DialogContent>
                </Dialog>

                {/* Dialog: Câmera ou Galeria (mobile) */}
                <Dialog open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
                    <DialogContent className="max-w-[280px] gap-0 overflow-hidden p-0">
                        <DialogTitle className="sr-only">Escolher fonte</DialogTitle>
                        <button
                            type="button"
                            onClick={() => { setSourceMenuOpen(false); setTimeout(() => cameraInputRef.current?.click(), 50); }}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium hover:bg-muted active:bg-muted"
                        >
                            <Camera className="h-4 w-4 text-muted-foreground" />
                            Câmera
                        </button>
                        <Separator />
                        <button
                            type="button"
                            onClick={() => { setSourceMenuOpen(false); setTimeout(() => galleryInputRef.current?.click(), 50); }}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium hover:bg-muted active:bg-muted"
                        >
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            Galeria
                        </button>
                    </DialogContent>
                </Dialog>

                {value ? (
                    <div className="relative h-11 w-11 overflow-hidden rounded-md border">
                        <Image src={value} alt="" fill className="object-cover" />
                        <button
                            type="button"
                            disabled={disabled || loading}
                            onClick={() => setActionMenuOpen(true)}
                            className="absolute inset-0 flex items-end justify-end p-0.5"
                        >
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-black/60">
                                {loading ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                                ) : (
                                    <Pencil className="h-3 w-3 text-white" />
                                )}
                            </span>
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={disabled || loading}
                        onClick={openFileSource}
                        className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/40 transition-colors",
                            "hover:border-primary/40 hover:bg-muted/60 active:bg-muted/80",
                            (disabled || loading) && "cursor-not-allowed opacity-50"
                        )}
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                        )}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                {value ? (
                    <div className={cn(
                        compact ? "relative h-[120px] w-[120px]" : "relative h-[200px] w-[200px]",
                        "overflow-hidden rounded-md border shrink-0",
                        className
                    )}>
                        <div className="absolute right-2 top-2 z-10 flex gap-1">
                            {replaceable && (
                                <>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        onClick={() => replaceInputRef.current?.click()}
                                        disabled={disabled || loading}
                                        className="h-6 w-6 rounded-full"
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                    </Button>
                                    <input
                                        ref={replaceInputRef}
                                        type="file"
                                        className="hidden"
                                        onChange={onFileSelect}
                                        accept="image/*"
                                        disabled={disabled || loading}
                                    />
                                </>
                            )}
                            <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                onClick={removeImage}
                                disabled={disabled || loading}
                                className="h-6 w-6 rounded-full"
                            >
                                <X className="h-4 w-4 text-white" />
                            </Button>
                        </div>
                        <Image
                            src={value}
                            alt="Imagem do produto"
                            fill
                            className="object-cover"
                        />
                    </div>
                ) : (
                    <div className={cn(
                        compact ? "flex h-[120px] w-[120px]" : "flex h-[200px] w-[200px]",
                        "items-center justify-center rounded-md border border-dashed bg-muted/50 shrink-0",
                        className
                    )}>
                        {loading ? (
                            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <ImageIcon className="h-10 w-10" />
                                <span className="text-sm">Sem imagem</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!value && (
                <div>
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={disabled || loading}
                        className="relative"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        Carregar Imagem
                        <input
                            type="file"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            onChange={onFileSelect}
                            accept="image/*"
                            disabled={disabled || loading}
                        />
                    </Button>
                </div>
            )}

            {cropModal}
        </div>
    );
}
