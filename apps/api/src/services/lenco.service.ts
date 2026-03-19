import axios from 'axios';

export interface LencoAccountResolution {
    accountName: string;
    accountNumber: string;
    bankName?: string;
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

    private static getHeaders(secretKey?: string) {
        return {
            'Authorization': `Bearer ${secretKey || this.SECRET_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Resolve account details (Bank Account)
     */
    static async resolveBankAccount(accountNumber: string, bankId: string, secretKey?: string): Promise<LencoAccountResolution> {
        try {
            const response = await axios.post(`${this.BASE_URL}/resolve/bank-account`, {
                accountNumber,
                bankId
            }, {
                headers: this.getHeaders(secretKey)
            });
            // V2 response structure: data: { accountName, accountNumber, bank: { name, ... } }
            const data = response.data.data;
            return {
                accountName: data.accountName,
                accountNumber: data.accountNumber,
                bankName: data.bank?.name
            };
        } catch (error: any) {
            console.error('Lenco bank resolution failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to resolve bank account');
        }
    }

    /**
     * Resolve account details (Mobile Money)
     */
    static async resolveMobileMoney(phone: string, operator: string, secretKey?: string): Promise<LencoAccountResolution> {
        try {
            const response = await axios.post(`${this.BASE_URL}/resolve/mobile-money`, {
                phone,
                operator,
                country: 'zm'
            }, {
                headers: this.getHeaders(secretKey)
            });
            const data = response.data.data;
            return {
                accountName: data.accountName,
                accountNumber: data.phone
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
    }, subaccountId: string, secretKey?: string) {
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
                headers: this.getHeaders(secretKey)
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
    }, subaccountId: string, secretKey?: string) {
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
                headers: this.getHeaders(secretKey)
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
    static async getAccountBalance(accountId: string, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/accounts/${accountId}/balance`, {
                headers: this.getHeaders(secretKey)
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
    static async getTransactionById(transactionId: string, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transactions/${transactionId}`, {
                headers: this.getHeaders(secretKey)
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
    static async getAccountTransactions(accountId: string, params: { from?: string; to?: string; type?: string; search?: string } = {}, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transactions`, {
                headers: this.getHeaders(secretKey),
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
     * Check transfer/payout status
     */
    static async getTransferStatus(reference: string, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transfers/status/${reference}`, {
                headers: this.getHeaders(secretKey)
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco transfer status check failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to check transfer status');
        }
    }

    /**
     * Get transfer details by Lenco ID
     */
    static async getTransferById(transferId: string, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/transfers/${transferId}`, {
                headers: this.getHeaders(secretKey)
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco transfer fetch failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch transfer details');
        }
    }

    /**
     * Get list of banks with their codes
     */
    static async getBanks(secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/banks`, {
                headers: this.getHeaders(secretKey)
            });
            // Filter for Zambia (ZM) banks primarily
            const allBanks = response.data.data;
            return allBanks.filter((b: any) => b.country?.toLowerCase() === 'zm' || !b.country);
        } catch (error: any) {
            console.error('Lenco banks list failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch banks');
        }
    }

    /**
     * Helper to resolve mobile operator from phone number prefix (Zambia)
     */
    static resolveMobileOperator(phone: string): string | null {
        // Clean phone number (remove +, spaces, 26, etc)
        const clean = phone.replace(/[^0-9]/g, '');
        const normalized = clean.startsWith('260') ? '0' + clean.substring(3) : clean;
        
        if (normalized.startsWith('097') || normalized.startsWith('077')) return 'airtel';
        if (normalized.startsWith('096') || normalized.startsWith('076')) return 'mtn';
        if (normalized.startsWith('095') || normalized.startsWith('075')) return 'zamtel';
        
        return null;
    }

    /**
     * Check collection status
     */
    static async getCollectionStatus(reference: string, secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/collections/status/${reference}`, {
                headers: this.getHeaders(secretKey)
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
    static async listAccounts(secretKey?: string) {
        try {
            const response = await axios.get(`${this.BASE_URL}/accounts`, {
                headers: this.getHeaders(secretKey)
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
    static async createAccount(name: string, currency: string = 'ZMW', secretKey?: string) {
        try {
            const response = await axios.post(`${this.BASE_URL}/accounts`, {
                name,
                currency,
                type: 'default' // Or appropriate type based on Lenco V2
            }, {
                headers: this.getHeaders(secretKey)
            });
            return response.data.data;
        } catch (error: any) {
            console.error('Lenco account creation failed:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to create Lenco account');
        }
    }
}
