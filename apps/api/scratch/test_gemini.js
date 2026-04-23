
const axios = require('axios');

const API_KEY = 'AIzaSyCEXiNh5nl4t8L0SBqooTOelJliXSqG6Fg';

async function testModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    try {
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: 'Hello' }] }]
        });
        console.log(`Model: ${model}, Status: ${response.status}`);
        if (response.data && response.data.candidates) {
            console.log(`Response: ${response.data.candidates[0].content.parts[0].text.substring(0, 50)}...`);
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
    await testModel('gemini-2.0-flash');
    await testModel('gemini-1.5-flash');
}

run();
