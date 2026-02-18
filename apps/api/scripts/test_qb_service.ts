
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load from the api directory to be safe
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import { QuickBooksService } from '../src/services/quickbooks.service';

console.log('Testing QuickBooksService directly...');

try {
    const url = QuickBooksService.getAuthUrl();
    console.log('Generated URL:', url);
    if (url.includes('client_id=undefined')) {
        console.error('FAIL: client_id is undefined in URL');
    } else if (url.includes('client_id=ABZtg')) {
        console.log('SUCCESS: client_id is present in URL');
    } else {
        console.warn('uncertain: client_id might be present but mismatch? URL:', url);
    }
} catch (error) {
    console.error('Error generating URL:', error);
}
