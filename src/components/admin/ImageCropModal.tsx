"use client";

import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn } from "lucide-react";

interface ImageCropModalProps {
    open: boolean;
    imageSrc: string;
    onConfirm: (croppedBlob: Blob) => void;
    onCancel: () => void;
    aspectRatio?: number;
}

/**
 * Crops the image to the specified area and returns a Blob.
 */
async function getCroppedImage(
    imageSrc: string,
    pixelCrop: Area
): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas toBlob failed"));
            },
            "image/jpeg",
            0.92
        );
    });
}

function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", (error) => reject(error));
        image.setAttribute("crossOrigin", "anonymous");
        image.src = url;
    });
}

export function ImageCropModal({
    open,
    imageSrc,
    onConfirm,
    onCancel,
    aspectRatio = 1,
}: ImageCropModalProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;

        setIsProcessing(true);
        try {
            const croppedBlob = await getCroppedImage(imageSrc, croppedAreaPixels);
            onConfirm(croppedBlob);
        } catch (error) {
            console.error("Erro ao recortar imagem:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
                <DialogTitle className="px-6 pt-6 text-lg font-semibold">
                    Recortar Imagem
                </DialogTitle>
                <DialogDescription className="px-6 text-sm text-muted-foreground">
                    Arraste e ajuste o zoom para enquadrar a imagem do produto.
                </DialogDescription>

                {/* Crop Area */}
                <div className="relative w-full h-[350px] bg-black/95">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspectRatio}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        cropShape="rect"
                        showGrid={true}
                    />
                </div>

                {/* Zoom Control */}
                <div className="px-6 py-3 flex items-center gap-3">
                    <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Slider
                        value={[zoom]}
                        min={1}
                        max={3}
                        step={0.1}
                        onValueChange={(values) => setZoom(values[0])}
                        className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground w-10 text-right">
                        {zoom.toFixed(1)}x
                    </span>
                </div>

                <DialogFooter className="px-6 pb-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={isProcessing}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                    >
                        {isProcessing ? "Processando..." : "Confirmar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
