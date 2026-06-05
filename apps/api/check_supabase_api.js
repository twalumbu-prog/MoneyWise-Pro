const path = require('path');

const ACCESS_TOKEN = 'sbp_12cfd0b0f1db6bd6313a253fbcd65abad001dbf2';

async function listProjects() {
    try {
        console.log('Listing projects using Supabase Management API...');
        const response = await fetch('https://api.supabase.com/v1/projects', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log('Status Code:', response.status);
        console.log('Response:', data);
    } catch (err) {
        console.error('Catch error:', err);
    }
}

listProjects();
