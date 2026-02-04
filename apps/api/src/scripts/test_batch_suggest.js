
const API_URL = 'http://localhost:3000';

async function testBatchSuggest() {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder - will need real token

    const testData = {
        line_items: [
            { id: '1', description: 'Fuel for school van', amount: 500 }
        ]
    };

    console.log('Testing batch suggest with:', JSON.stringify(testData, null, 2));

    try {
        const response = await fetch(`${API_URL}/accounts/suggest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(testData)
        });

        console.log('Status:', response.status);
        console.log('Headers:', Object.fromEntries(response.headers.entries()));

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

    } catch (err) {
        console.error('Error:', err);
    }
}

testBatchSuggest();
