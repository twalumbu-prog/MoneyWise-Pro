import axios from 'axios';

export interface LencoAccountResolution {
    account_name: string;
    account_number: string;
    bank_name?: string;
}

export interface LencoPayoutRequest {
    amount: number;
    reference: string;
    account_number: string;
    bank_code: string;
    account_name: string;
    description: string;
}

export class LencoService {
    private static readonly BASE_URL = 'https://api.lenco.co/access/v2';
    private static readonly SECRET_KEY = process.env.LENCO_SECRET_KEY;

    private static get headers() {
        return {
            'Authorization': `Bearer ${this.SECRET_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Resolve account details (Bank Account)
     */
    static async resolveBankAccount(accountNumber: string, bankId: string): Promise<LencoAccountResolution> {
        try {
            const response = await axios.post(`${this.BASE_URL}/resolve/bank-account`, {
                accountNumber,
                bankId
            }, {
                headers: this.headers
            });
            // V2 response structure: data: { accountName, accountNumber, bank: { name, ... } }
            const data = response.data.data;
            return {
                account_name: data.accountName,
                account_number: data.accountNumber,
                bank_name: data.bank?.name
            };
        } catch (error: any) {
            console.error('Lenco bank resolution failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to resolve bank account');
        }
    }

    /**
     * Resolve account details (Mobile Money)
     */
    static async resolveMobileMoney(phone: string, operator: string): Promise<LencoAccountResolution> {
        try {
            const response = await axios.post(`${this.BASE_URL}/resolve/mobile-money`, {
                phone,
                operator,
                country: 'zm'
            }, {
                headers: this.headers
            });
            const data = response.data.data;
            return {
                account_name: data.accountName,
                account_number: data.phone
            };
        } catch (error: any) {
            console.error('Lenco mobile money resolution failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to resolve mobile money account');
        }
    }

    /**
     * Create a payout (Transfer) - Mobile Money
     */
    static async createMobileMoneyPayout(payout: {
        amount: number,
        reference: string,
        phone: string,
        operator: string,
        narration: string
    }, subaccountId: string) {
        try {
            const body = {
                accountId: subaccountId, // debit account
                amount: payout.amount,
                reference: payout.reference,
                phone: payout.phone,
                operator: payout.operator,
                country: 'zm',
                narration: payout.narration
            };

            const response = await axios.post(`${this.BASE_URL}/transfers/mobile-money`, body, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco payout creation failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
        }
    }

    /**
     * Create a payout (Transfer) - Bank Account
     */
    static async createBankPayout(payout: {
        amount: number,
        reference: string,
        accountNumber: string,
        bankId: string,
        narration: string
    }, subaccountId: string) {
        try {
            const body = {
                accountId: subaccountId,
                amount: payout.amount,
                reference: payout.reference,
                accountNumber: payout.accountNumber,
                bankId: payout.bankId,
                country: 'zm',
                narration: payout.narration
            };

            const response = await axios.post(`${this.BASE_URL}/transfers/bank-account`, body, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco bank payout creation failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to initiate bank transfer');
        }
    }

    /**
     * Get account balance
     */
    static async getAccountBalance(accountId: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/accounts/${accountId}/balance`, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco balance check failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch balance');
        }
    }

    /**
     * Get transaction by ID
     */
    static async getTransactionById(transactionId: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transactions/${transactionId}`, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco transaction fetch failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch transaction details');
        }
    }

    /**
     * List transactions for an account
     */
    static async getAccountTransactions(accountId: string, params: { from?: string; to?: string; type?: string; search?: string } = {}) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transactions`, {
                headers: this.headers,
                params: {
                    ...params,
                    accountId
                }
            });
            return response.data;
        } catch (error: any) {
            console.error('Lenco transactions list failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to list transactions');
        }
    }

    /**
     * Check collection status
     */
    static async getCollectionStatus(reference: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/collections/status/${reference}`, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco collection status check failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to check status');
        }
    }

    /**
     * List all Lenco accounts (Subaccounts)
     */
    static async listAccounts() {
        try {
            const response = await axios.get(`${this.BASE_URL}/accounts`, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco list accounts failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch Lenco accounts');
        }
    }

    /**
     * Create a new Lenco account (Subaccount)
     */
    static async createAccount(name: string, currency: string = 'ZMW') {
        try {
            const response = await axios.post(`${this.BASE_URL}/accounts`, {
                name,
                currency,
                type: 'default' // Or appropriate type based on Lenco V2
            }, {
                headers: this.headers
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco account creation failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to create Lenco account');
        }
    }
}
