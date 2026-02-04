
// Native fetch is available in Node 18+

const API_URL = 'http://localhost:3000';

async function createRequestor() {
    const user = {
        email: 'requestor1@example.com',
        password: 'RequestorPassword123!',
        employeeId: 'EMP002',
        name: 'Test Requestor',
        role: 'REQUESTOR'
    };

    try {
        console.log('Registering requestor...');
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Registration failed:', data);
            if (data.error === 'Employee ID already exists') {
                console.log('User already exists, proceeding...');
                return;
            }
            throw new Error(data.error);
        }

        console.log('Requestor registered successfully:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

createRequestor();
