export interface LoanProduct { id: string; name: string; interest: number; maxPeriod: number }
export interface LoanProvider { id: string; name: string; description: string; logo: string | null; products: LoanProduct[] }

/** Matches apps/web/src/components/requisitions/MobileStaffLoanWizard.tsx's EXTERNAL_LOAN_PROVIDERS. */
export const EXTERNAL_LOAN_PROVIDERS: LoanProvider[] = [
    {
        id: 'unifi', name: 'UniFi', description: 'Fast personal loans with flexible repayment terms.', logo: 'unifi',
        products: [
            { id: 'unifi-personal', name: 'UniFi Personal Loan', interest: 18, maxPeriod: 48 },
            { id: 'unifi-salary', name: 'UniFi Salary Advance', interest: 12, maxPeriod: 12 },
        ],
    },
    {
        id: 'lolc', name: 'LOLC Finance', description: 'Micro and SME finance solutions across Zambia.', logo: 'lolc',
        products: [
            { id: 'lolc-micro', name: 'LOLC Micro Loan', interest: 20, maxPeriod: 36 },
            { id: 'lolc-salary', name: 'LOLC Salary Loan', interest: 15, maxPeriod: 24 },
        ],
    },
    {
        id: 'finca', name: 'FINCA', description: 'Community-focused microfinance and personal loans.', logo: 'finca',
        products: [
            { id: 'finca-personal', name: 'FINCA Personal Loan', interest: 19, maxPeriod: 36 },
            { id: 'finca-group', name: 'FINCA Group Loan', interest: 16, maxPeriod: 24 },
        ],
    },
    {
        id: 'agora', name: 'Agora Microfinance', description: 'Affordable microfinance for salaried employees.', logo: 'agora',
        products: [
            { id: 'agora-standard', name: 'Agora Standard Loan', interest: 17, maxPeriod: 36 },
            { id: 'agora-express', name: 'Agora Express Loan', interest: 14, maxPeriod: 12 },
        ],
    },
    {
        id: 'bayport', name: 'Bayport', description: 'Payroll-linked personal loans with competitive rates.', logo: 'bayport',
        products: [
            { id: 'bayport-personal', name: 'Bayport Personal Loan', interest: 16, maxPeriod: 60 },
            { id: 'bayport-top-up', name: 'Bayport Top-Up Loan', interest: 14, maxPeriod: 36 },
        ],
    },
    {
        id: 'mfz', name: 'Microfinance Zambia', description: 'Inclusive financial services for working Zambians.', logo: 'mfz',
        products: [
            { id: 'mfz-salary', name: 'MFZ Salary Loan', interest: 18, maxPeriod: 36 },
            { id: 'mfz-personal', name: 'MFZ Personal Loan', interest: 21, maxPeriod: 48 },
        ],
    },
];
