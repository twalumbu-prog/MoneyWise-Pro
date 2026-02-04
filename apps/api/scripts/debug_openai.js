
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log('Checking OpenAI Key...');
if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is missing from process.env');
    process.exit(1);
}
console.log('✅ Key present, length:', OPENAI_API_KEY.length);

async function testOpenAI() {
    const description = "ZESCO prepaid electricity units";
    console.log(`\nTesting classification for: "${description}"`);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an accounting assistant. Classify the transaction description into an intent and suggest a 4-digit account code from the 5000-9000 series. Respond ONLY in JSON: {"intent": {"category": "...", "tags": []}, "suggested_code": "...", "confidence": 0.0-1.0}' },
                    { role: 'user', content: description }
                ],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('✅ OpenAI Response:', JSON.stringify(data, null, 2));

        const content = JSON.parse(data.choices[0].message.content);
        console.log('✅ Parsed Content:', content);

    } catch (error) {
        console.error('❌ Request Failed:', error.message);
    }
}

testOpenAI();
