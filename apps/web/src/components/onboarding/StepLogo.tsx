import React, { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Trash2, RefreshCw, Crop, Loader2, ImageIcon, ImagePlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { organizationService } from '../../services/organization.service';
import { StepFooter, ErrorBanner, PrimaryButton, GhostButton } from './ui';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml'];
const ACCEPT_ATTR = '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml';

interface Props {
    organizationId: string;
    organizationName: string;
    logoUrl: string | null;
    onLogoChanged: (url: string | null) => void;
    onBack: () => void;
    onContinue: () => void;
    saving: boolean;
}

/**
 * Step 2 — business logo. A large blue-bordered square (per the Figma design):
 * drag & drop or tap to browse, square-crop raster images on a canvas (SVGs skip
 * cropping), preview, replace and remove. Files land in the existing
 * `organization-logos` Supabase Storage bucket.
 */
export const StepLogo: React.FC<Props> = ({
    organizationId, organizationName, logoUrl, onLogoChanged, onBack, onContinue, saving,
}) => {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cropSource, setCropSource] = useState<{ url: string; type: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const upload = async (blob: Blob, ext: string) => {
        setUploading(true);
        setError(null);
        try {
            const path = `${organizationId}/logo-${Date.now()}.${ext}`;
            const { data, error: uploadError } = await supabase.storage
                .from('organization-logos')
                .upload(path, blob, { cacheControl: '3600', upsert: true });
            if (uploadError) throw uploadError;

            const publicUrl = supabase.storage
                .from('organization-logos')
                .getPublicUrl(data.path).data.publicUrl;

            await organizationService.updateOrganization({ logo_url: publicUrl });
            onLogoChanged(publicUrl);
        } catch (err: any) {
            setError(err.message || 'Failed to upload the logo. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleFile = useCallback(async (file: File) => {
        setError(null);
        if (!ACCEPTED.includes(file.type)) {
            setError('Please choose a PNG, JPG, JPEG or SVG image.');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            setError('That image is larger than 8MB. Please choose a smaller file.');
            return;
        }
        if (file.type === 'image/svg+xml') {
            // Vector — upload as-is, no crop.
            await upload(file, 'svg');
            return;
        }
        // Raster — open the crop modal.
        setCropSource({ url: URL.createObjectURL(file), type: file.type });
    }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCropped = async (blob: Blob) => {
        setCropSource(null);
        // Compress the cropped square before uploading.
        const compressed = await imageCompression(
            new File([blob], 'logo.png', { type: 'image/png' }),
            { maxSizeMB: 0.4, maxWidthOrHeight: 512, useWebWorker: true }
        ).catch(() => blob);
        await upload(compressed, 'png');
    };

    const handleRemove = async () => {
        try {
            setUploading(true);
            setError(null);
            await organizationService.updateOrganization({ logo_url: null as any });
            onLogoChanged(null);
        } catch (err: any) {
            setError(err.message || 'Failed to remove the logo.');
        } finally {
            setUploading(false);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div className="flex flex-col items-center">
            <ErrorBanner message={error} />

            {/* The big square uploader (Figma: w-80 square, rounded-3xl, blue border) */}
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                aria-label={logoUrl ? 'Replace business logo' : 'Upload business logo'}
                className={`relative w-full max-w-80 aspect-square rounded-3xl border-2 flex items-center justify-center overflow-hidden transition-all focus:outline-none focus:ring-4 focus:ring-blue-700/20 ${
                    dragging
                        ? 'border-blue-700 bg-blue-50 scale-[1.02]'
                        : 'border-blue-700 bg-white hover:bg-blue-50/60'
                }`}
            >
                {uploading ? (
                    <Loader2 className="h-10 w-10 text-blue-700 animate-spin" />
                ) : logoUrl ? (
                    <img src={logoUrl} alt="Business logo" className="w-full h-full object-contain p-6" />
                ) : (
                    <ImagePlus className="h-10 w-10 text-slate-500" strokeWidth={1.5} />
                )}
            </button>

            {/* Replace / remove controls once a logo exists */}
            {logoUrl && !uploading && (
                <div className="mt-4 flex items-center gap-2">
                    <GhostButton onClick={() => fileInputRef.current?.click()} className="!min-h-0 !py-2 !px-4 !text-sm">
                        <RefreshCw className="h-4 w-4" />
                        Replace
                    </GhostButton>
                    <GhostButton onClick={handleRemove} className="!min-h-0 !py-2 !px-4 !text-sm !text-red-500 hover:!bg-red-50">
                        <Trash2 className="h-4 w-4" />
                        Remove
                    </GhostButton>
                </div>
            )}

            <p className="mt-5 text-center text-gray-600 text-base font-bold">{organizationName}</p>
            <p className="mt-2 text-center text-gray-600 text-sm leading-6">
                You can always add or edit this later in the settings.
            </p>

            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
                }}
            />

            {cropSource && (
                <CropModal
                    src={cropSource.url}
                    onCancel={() => { URL.revokeObjectURL(cropSource.url); setCropSource(null); }}
                    onConfirm={handleCropped}
                />
            )}

            <div className="w-full">
                <StepFooter
                    onBack={onBack}
                    loading={saving || uploading}
                    continueLabel={logoUrl ? 'Continue' : 'Skip for now'}
                    onContinue={onContinue}
                />
            </div>
        </div>
    );
};

// ── Square crop modal ─────────────────────────────────────────────────────────
// Pan with pointer drag, zoom with the slider; exports a 512×512 PNG.

const VIEWPORT = 288;
const EXPORT_SIZE = 512;

const CropModal: React.FC<{ src: string; onCancel: () => void; onConfirm: (blob: Blob) => void }> = ({ src, onCancel, onConfirm }) => {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [exporting, setExporting] = useState(false);
    const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

    useEffect(() => {
        const image = new Image();
        image.onload = () => setImg(image);
        image.src = src;
    }, [src]);

    // Scale so the image covers the viewport at zoom=1.
    const baseScale = img ? Math.max(VIEWPORT / img.width, VIEWPORT / img.height) : 1;
    const scale = baseScale * zoom;

    const clampOffset = useCallback((x: number, y: number, z = zoom) => {
        if (!img) return { x, y };
        const s = baseScale * z;
        const maxX = Math.max(0, (img.width * s - VIEWPORT) / 2);
        const maxY = Math.max(0, (img.height * s - VIEWPORT) / 2);
        return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    }, [img, baseScale, zoom]);

    const onPointerDown = (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current) return;
        setOffset(clampOffset(
            drag.current.baseX + (e.clientX - drag.current.startX),
            drag.current.baseY + (e.clientY - drag.current.startY),
        ));
    };
    const onPointerUp = () => { drag.current = null; };

    const confirm = async () => {
        if (!img) return;
        setExporting(true);
        const canvas = document.createElement('canvas');
        canvas.width = EXPORT_SIZE;
        canvas.height = EXPORT_SIZE;
        const ctx = canvas.getContext('2d')!;
        const ratio = EXPORT_SIZE / VIEWPORT;
        ctx.translate(EXPORT_SIZE / 2 + offset.x * ratio, EXPORT_SIZE / 2 + offset.y * ratio);
        ctx.scale(scale * ratio, scale * ratio);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob((blob) => {
            if (blob) onConfirm(blob);
            else setExporting(false);
        }, 'image/png');
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Crop logo">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm mw-anim" style={{ animation: 'mw-fade-up 0.25s ease-out both' }}>
                <div className="flex items-center gap-2 mb-4">
                    <Crop className="h-4 w-4 text-blue-700" />
                    <h2 className="text-base font-bold text-gray-800">Crop your logo</h2>
                </div>

                <div
                    className="relative mx-auto rounded-2xl overflow-hidden bg-gray-100 touch-none cursor-grab active:cursor-grabbing"
                    style={{ width: VIEWPORT, height: VIEWPORT }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                >
                    {img ? (
                        <img
                            src={src}
                            alt=""
                            draggable={false}
                            className="absolute left-1/2 top-1/2 max-w-none select-none"
                            style={{
                                width: img.width,
                                height: img.height,
                                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                            }}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-gray-300" />
                        </div>
                    )}
                    {/* Crop frame */}
                    <div className="absolute inset-0 pointer-events-none border-2 border-white/70 rounded-2xl" />
                </div>

                <label className="block mt-5">
                    <span className="text-xs font-bold text-gray-500">Zoom</span>
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        aria-label="Zoom"
                        onChange={(e) => {
                            const z = Number(e.target.value);
                            setZoom(z);
                            setOffset(o => clampOffset(o.x, o.y, z));
                        }}
                        className="w-full mt-1 accent-blue-700"
                    />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                    <GhostButton onClick={onCancel}>Cancel</GhostButton>
                    <PrimaryButton onClick={confirm} loading={exporting} className="!min-h-0 !py-2.5 !px-5 !text-sm">
                        Use this crop
                    </PrimaryButton>
                </div>
            </div>
        </div>
    );
};
