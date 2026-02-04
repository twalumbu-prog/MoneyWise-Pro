
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('Checking Gemini Key...');
if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is missing from process.env');
    process.exit(1);
}
console.log('✅ Key present, length:', GEMINI_API_KEY.length);

async function testGemini() {
    const description = "ZESCO prepaid electricity units";
    console.log(`\nTesting Gemini classification for: "${description}"`);

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        const prompt = `You are an accounting assistant. Classify the transaction description into an intent and suggest a 4-digit account code.
        Description: ${description}
        Respond ONLY in JSON: {"account_code": "...", "confidence": 0.0-1.0, "reasoning": "..."}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const response = await result.response;
        const text = response.text();
        console.log('✅ Gemini Response:', text);

    } catch (error) {
        console.error('❌ Gemini Request Failed:', error);
    }
}

testGemini();
