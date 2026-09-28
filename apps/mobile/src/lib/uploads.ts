import { File } from 'expo-file-system';
import { getCore, requireCapability } from 'core';
import type { PickedFile } from 'core';

/**
 * Uploads to Supabase Storage from React Native.
 *
 * The web app hands `supabase.storage.upload` a Blob straight from an <input>.
 * That does not work here: RN's Blob is not backed by real bytes the storage
 * client can read, and uploads silently land as 0-byte objects. Reading the
 * file into a Uint8Array first is what makes it actually transfer, so
 * contentType must be passed explicitly too — there is no File.type to infer.
 */
export async function uploadToBucket(
    bucket: string,
    path: string,
    file: PickedFile,
): Promise<string> {
    const bytes = await new File(file.uri).bytes();
    const { error } = await getCore().supabase.storage.from(bucket).upload(path, bytes, {
        contentType: file.mimeType,
        upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
}

/**
 * Receipt path convention, identical to the web app
 * (`{requisitionId}/scans/{timestamp}_{index}.{ext}`). Both clients write into
 * the same bucket, so this must not diverge — the OCR pipeline and
 * requisitionService.getFileUrl both assume it.
 */
export function receiptPath(requisitionId: string, index: number, fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    return `${requisitionId}/scans/${Date.now()}_${index}.${ext}`;
}

/** Compress-then-upload a batch of receipts, returning their storage paths. */
export async function uploadReceipts(
    requisitionId: string,
    files: PickedFile[],
): Promise<string[]> {
    const compress = requireCapability('files').compressImage;
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
        const compressed = await compress(files[i], 3 * 1024 * 1024);
        const path = receiptPath(requisitionId, i, compressed.name);
        await uploadToBucket('receipts', path, compressed);
        paths.push(path);
    }
    return paths;
}
