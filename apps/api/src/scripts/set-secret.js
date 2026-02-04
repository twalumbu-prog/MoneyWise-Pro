
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'your-project-ref';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || 'your-access-token';
const KEY_NAME = 'OPENAI_API_KEY';
const KEY_VALUE = process.env.OPENAI_API_KEY || 'your-openai-api-key';

async function setSecret() {
    console.log(`Setting secret ${KEY_NAME} for project ${PROJECT_REF}...`);

    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([
                { name: KEY_NAME, value: KEY_VALUE }
            ])
        });

        console.log('Response Status:', response.status);

        if (response.status === 200 || response.status === 201) {
            console.log('✅ Secret set successfully!');
        } else {
            const data = await response.json().catch(() => ({}));
            console.error('❌ Failed to set secret:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

setSecret();
