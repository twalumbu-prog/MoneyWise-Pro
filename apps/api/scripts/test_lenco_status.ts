import { LencoService } from '../src/services/lenco.service';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testStatus() {
    const ref = `NON_EXISTENT_${Date.now()}`;
    const secretKey = process.env.LENCO_SECRET_KEY!; // Blue Opus default
    
    console.log(`Checking status for: ${ref}`);
    try {
        const status = await LencoService.getTransferStatus(ref, secretKey);
        console.log('Result:', status);
    } catch (err: any) {
        console.log('Error caught in script:');
        console.log('Status Code:', err.response?.status);
        console.log('Body:', err.response?.data);
        console.log('Message:', err.message);
    }

}

testStatus();
