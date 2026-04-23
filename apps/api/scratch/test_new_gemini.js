
const axios = require('axios');

const API_KEY = 'AIzaSyDy0Qqu7u4L5yy_Vc_Qpeg_4RwrbcdGmdg';

async function testModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    try {
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: 'Hello, are you gemini-2.5-flash-lite?' }] }]
        });
        console.log(`Model: ${model}, Status: ${response.status}`);
        if (response.data && response.data.candidates) {
            console.log(`Response: ${response.data.candidates[0].content.parts[0].text.substring(0, 100)}...`);
        }
    } catch (err) {
        console.error(`Error testing ${model}:`, err.response ? err.response.status : err.message);
        if (err.response && err.response.data) {
            console.log(JSON.stringify(err.response.data));
        }
    }
}

async function run() {
    await testModel('gemini-2.5-flash');
    await testModel('gemini-2.5-flash-lite');
    await testModel('gemini-1.5-flash');
}

run();
