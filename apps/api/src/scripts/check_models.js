const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error('GEMINI_API_KEY is not set');
    process.exit(1);
}

async function listModels() {
    const genAI = new GoogleGenerativeAI(API_KEY);

    console.log('--- Testing gemini-pro ---');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent('Say hello');
        const response = await result.response;
        console.log('Success:', response.text());
    } catch (e) {
        console.error('Failed:', e.message);
    }

    console.log('\n--- Testing gemini-1.5-flash ---');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent('Say hello');
        const response = await result.response;
        console.log('Success:', response.text());
    } catch (e) {
        console.error('Failed:', e.message);
    }
}

listModels();
