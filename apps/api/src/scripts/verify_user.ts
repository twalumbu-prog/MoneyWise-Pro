
const API_URL = 'http://localhost:3000';

async function checkUser() {
    console.log('Attempting login to verify user existence...');
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'requestor1@example.com',
                password: 'RequestorPassword123!'
            })
        });

        const data = await response.json();
        console.log('Login status:', response.status);
        if (response.ok) {
            console.log('User exists and can login.');
        } else {
            console.log('Login failed:', data);
        }
    } catch (e) {
        console.error('Connection error:', e);
    }
}

checkUser();
