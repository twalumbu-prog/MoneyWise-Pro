
// Native fetch is available in Node 18+

const API_URL = 'http://localhost:3000';

async function createCashier() {
    const cashier = {
        email: 'accountant1@example.com',
        password: 'AccountantPassword123!',
        employeeId: 'ACC001',
        name: 'John Accountant',
        role: 'ACCOUNTANT'
    };

    try {
        console.log('Registering accountant...');
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cashier)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Registration failed:', data);

            if (data.error === 'Employee ID already exists') {
                console.log('Cashier already exists, proceeding...');
                return;
            }
            throw new Error(data.error);
        }

        console.log('Cashier registered successfully:', data);
    } catch (error) {
        console.error('Error:', error);
    }
}

createCashier();
