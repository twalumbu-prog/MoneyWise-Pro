import imageCompression from 'browser-image-compression';

export const compressImage = async (file: File): Promise<File> => {
    // Check for HEIC/HEIF files which might not have a proper MIME type in all browsers
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || 
                   file.type === 'image/heic' || file.type === 'image/heif';

    // Only compress images (including HEIC)
    if (!file.type.startsWith('image/') && !isHeic) {
        return file;
    }

    const options = {
        maxSizeMB: 1, // Max size 1MB
        maxWidthOrHeight: 1920, // Max resolution 1080p equivalent
        useWebWorker: true,
        initialQuality: 0.8,
        fileType: 'image/jpeg' // Force conversion to JPEG for widest compatibility
    };

    try {
        const compressedBlob = await imageCompression(file, options);
        
        // Ensure the file extension is updated if we converted to JPEG
        let newFileName = file.name;
        if (isHeic) {
            newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
        }

        // Convert Blob back to File to maintain original properties if possible
        return new File([compressedBlob], newFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch (error) {
        console.error('Image compression failed:', error);
        // Fallback to original file if compression fails
        return file;
    }
};
