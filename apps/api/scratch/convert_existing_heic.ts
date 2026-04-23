
const convert = require('heic-convert');
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function convertHeicToJpg() {
    console.log('--- Starting HEIC to JPG Conversion Migration ---');

    // 1. Find all receipts with HEIC extension
    const { data: receipts, error: fetchError } = await supabase
        .from('receipts')
        .select('*')
        .or('file_url.ilike.%.heic,file_url.ilike.%.heif');

    if (fetchError) {
        console.error('Error fetching receipts:', fetchError);
        return;
    }

    console.log(`Found ${receipts?.length || 0} HEIC/HEIF receipts to convert.`);

    if (!receipts || receipts.length === 0) return;

    for (const receipt of receipts) {
        try {
            console.log(`Processing receipt: ${receipt.id} (${receipt.file_url})`);

            // Strip "receipts/" prefix if present for storage calls
            const storagePath = receipt.file_url.startsWith('receipts/') 
                ? receipt.file_url.substring(9) 
                : receipt.file_url;

            // 2. Download from storage
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('receipts')
                .download(storagePath);

            if (downloadError) {
                console.error(`  Download failed for ${storagePath}:`, downloadError);
                continue;
            }

            // 3. Convert to JPEG
            const inputBuffer = Buffer.from(await fileData.arrayBuffer());
            const outputBuffer = await convert({
                buffer: inputBuffer,
                format: 'JPEG',
                quality: 0.8
            });

            // 4. Upload JPEG
            const newStoragePath = storagePath.replace(/\.(heic|heif)$/i, '.jpg');
            const { error: uploadError } = await supabase.storage
                .from('receipts')
                .upload(newStoragePath, outputBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) {
                console.error(`  Upload failed for ${newStoragePath}:`, uploadError);
                continue;
            }

            // 5. Update database record
            // Restore prefix if it was there originally
            const newFileUrl = receipt.file_url.startsWith('receipts/')
                ? `receipts/${newStoragePath}`
                : newStoragePath;

            const { error: updateError } = await supabase
                .from('receipts')
                .update({ file_url: newFileUrl })
                .eq('id', receipt.id);

            if (updateError) {
                console.error(`  DB update failed for ${receipt.id}:`, updateError);
                continue;
            }

            console.log(`  Successfully converted and updated: ${newFileUrl}`);
        } catch (err) {
            console.error(`  Failed to process receipt ${receipt.id}:`, err);
        }
    }

    console.log('--- Migration Complete ---');
}

convertHeicToJpg();
