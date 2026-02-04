import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GENIMI_API_KEY is not set');
    process.exit(1);
}

async function listModels() {
    const genAI = new GoogleGenerativeAI(API_KEY);
    try {
        // Need to use the model manager if available in the SDK, but standard generic list might not be direct in this SDK version
        // Actually, the SDK doesn't expose listModels directly on genAI instance easily in all versions.
        // Let's try a direct fetch if SDK fails, or just try to generate with a basic model.

        console.log('Testing model: gemini-1.5-flash');
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent('Hello');
            console.log('Success with gemini-1.5-flash:', await result.response.then(r => r.text()));
        } catch (e: any) {
            console.error('Failed gemini-1.5-flash:', e.message);
        }

        console.log('Testing model: gemini-pro');
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent('Hello');
            console.log('Success with gemini-pro:', await result.response.then(r => r.text()));
        } catch (e: any) {
            console.error('Failed gemini-pro:', e.message);
        }

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

listModels();
