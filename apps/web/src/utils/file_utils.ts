import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';

export const compressImage = async (file: File): Promise<File> => {
    // Check for HEIC/HEIF files which might not have a proper MIME type in all browsers
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || 
                   file.type === 'image/heic' || file.type === 'image/heif';

    // Only compress images (including HEIC)
    if (!file.type.startsWith('image/') && !isHeic) {
        return file;
    }

    let fileToCompress = file;

    // If it's a HEIC file, try to convert it to JPEG first using heic2any
    if (isHeic) {
        try {
            const convertedBlob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.8
            });
            
            // heic2any can return an array of blobs if it's an animated HEIC, we just want the first one
            const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            
            const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
            fileToCompress = new File([singleBlob], newFileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
            });
        } catch (error) {
            console.error('HEIC conversion failed, falling back to original file:', error);
            // Fallback to original file, browser-image-compression might still handle it if lucky
        }
    }

    const options = {
        maxSizeMB: 1, // Max size 1MB
        maxWidthOrHeight: 1920, // Max resolution 1080p equivalent
        useWebWorker: true,
        initialQuality: 0.8,
        fileType: 'image/jpeg' // Force conversion to JPEG for widest compatibility
    };

    try {
        const compressedBlob = await imageCompression(fileToCompress, options);
        
        // Ensure we maintain the name from fileToCompress (which might have been updated to .jpg)
        const finalFileName = fileToCompress.name;

        // Convert Blob back to File to maintain original properties if possible
        return new File([compressedBlob], finalFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });
    } catch (error) {
        console.error('Image compression failed:', error);
        // Fallback to fileToCompress if compression fails
        return fileToCompress;
    }
};
