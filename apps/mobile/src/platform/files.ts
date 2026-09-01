import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import type { FileAdapter, PickedFile, FilePickOptions } from 'core';

/**
 * Native file access for core's FileAdapter.
 *
 * The web equivalent is a hidden <input type="file"> plus browser-image-compression
 * and heic2any. None of that exists here, and the input differs in kind: on a
 * phone the dominant source is the camera, and iOS hands back HEIC by default.
 * expo-image-picker is configured to transcode to JPEG on the way out, which is
 * what removes the HEIC problem the web app has to solve in JavaScript.
 */

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // matches the web's receipt budget

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedFile {
    return {
        uri: asset.uri,
        name: asset.fileName ?? `receipt_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
    };
}

/** Camera capture. Separate from pick() because it needs its own permission. */
export async function captureImage(): Promise<PickedFile | null> {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
        throw new Error(
            'MoneyWise needs camera access to photograph receipts. Enable it in Settings > MoneyWise.',
        );
    }
    const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return null;
    return toPicked(result.assets[0]);
}

async function pickImages(multiple: boolean): Promise<PickedFile[]> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
        throw new Error(
            'MoneyWise needs photo access to attach receipts. Enable it in Settings > MoneyWise.',
        );
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: multiple,
        quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return [];
    return result.assets.map(toPicked);
}

async function pickDocuments(multiple: boolean, accept?: string[]): Promise<PickedFile[]> {
    const result = await DocumentPicker.getDocumentAsync({
        multiple,
        type: accept?.length ? accept : '*/*',
        copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return [];
    return result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size ?? undefined,
    }));
}

export const filesAdapter: FileAdapter = {
    async pick(options: FilePickOptions): Promise<PickedFile[]> {
        const multiple = options.multiple ?? false;
        if (options.kind === 'image') return pickImages(multiple);
        return pickDocuments(multiple, options.accept);
    },

    /**
     * Downscale until the file fits the budget. Receipts are photographed at
     * full sensor resolution — often 4–8MB — and uploading that over a Zambian
     * mobile connection is slow enough that users abandon the request.
     */
    async compressImage(file: PickedFile, maxBytes = MAX_UPLOAD_BYTES): Promise<PickedFile> {
        if (!file.mimeType.startsWith('image/')) return file;
        if (file.size != null && file.size <= maxBytes) return file;

        let width = 2000;
        let current = file;

        // Two passes is enough in practice; a third rarely helps and costs a
        // visible pause on older Android hardware.
        for (let attempt = 0; attempt < 2; attempt++) {
            const context = ImageManipulator.ImageManipulator.manipulate(current.uri);
            context.resize({ width });
            const image = await context.renderAsync();
            const out = await image.saveAsync({
                compress: attempt === 0 ? 0.7 : 0.5,
                format: ImageManipulator.SaveFormat.JPEG,
            });
            current = {
                uri: out.uri,
                name: current.name.replace(/\.[^.]+$/, '') + '.jpg',
                mimeType: 'image/jpeg',
            };
            width = Math.round(width * 0.7);
        }
        return current;
    },
};
