
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load from the api directory to be safe
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
}

console.log('QB_CLIENT_ID:', process.env.QB_CLIENT_ID ? 'FOUND (' + process.env.QB_CLIENT_ID.substring(0, 5) + '...)' : 'MISSING');
console.log('QB_CLIENT_SECRET:', process.env.QB_CLIENT_SECRET ? 'FOUND' : 'MISSING');
