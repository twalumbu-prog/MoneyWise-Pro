import imageCompression from 'browser-image-compression';

export const compressImage = async (file: File): Promise<File> => {
    // Only compress images
    if (!file.type.startsWith('image/')) {
        return file;
    }

    const options = {
        maxSizeMB: 1, // Max size 1MB
        maxWidthOrHeight: 1920, // Max resolution 1080p equivalent
        useWebWorker: true,
        initialQuality: 0.8,
    };

    try {
        const compressedBlob = await imageCompression(file, options);
        // Convert Blob back to File to maintain original properties if possible
        return new File([compressedBlob], file.name, {
            type: compressedBlob.type,
            lastModified: Date.now(),
        });
    } catch (error) {
        console.error('Image compression failed:', error);
        // Fallback to original file if compression fails
        return file;
    }
};
