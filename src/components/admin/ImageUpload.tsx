"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
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
}

export function ImageUpload({ value, onChange, disabled, className }: ImageUploadProps) {
    const [loading, setLoading] = useState(false);
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
    const supabase = createClient();

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

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                {value ? (
                    <div className={cn("relative h-[200px] w-[200px] overflow-hidden rounded-md border", className)}>
                        <div className="absolute right-2 top-2 z-10">
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
                    <div className={cn("flex h-[200px] w-[200px] items-center justify-center rounded-md border border-dashed bg-muted/50", className)}>
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

            {/* Crop Modal */}
            {rawImageSrc && (
                <ImageCropModal
                    open={cropModalOpen}
                    imageSrc={rawImageSrc}
                    onConfirm={handleCropConfirm}
                    onCancel={handleCropCancel}
                    aspectRatio={1}
                />
            )}
        </div>
    );
}
