
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is missing from process.env');
    process.exit(1);
}

async function testGeminiRest() {
    const description = "ZESCO prepaid electricity units";
    console.log(`\nTesting Gemini REST API for: "${description}"`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

    // Note: Gemini JSON structure for REST is specific
    const payload = {
        contents: [{
            parts: [{
                text: `You are an accounting assistant. Classify the transaction description into an intent and suggest a 4-digit account code. Description: ${description}. Respond ONLY in JSON: {"account_code": "...", "confidence": 0.0-1.0, "reasoning": "..."}`
            }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('✅ Gemini REST Response Status:', response.status);

        // Extract content
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
            console.log('✅ Generated Content:', content);
        } else {
            console.log('⚠️ No content in response:', JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('❌ Request Failed:', error.message);
    }
}

testGeminiRest();
