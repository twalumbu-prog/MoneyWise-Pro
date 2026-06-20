export interface CategorizationExample {
    description: string;
    account_code: string;
    account_name?: string;
}

export const CATEGORIZATION_SYSTEM_PROMPT = `
You are an expert accountant assistant. Your goal is to map a given transaction description to the most appropriate category FROM THE PROVIDED Chart of Accounts (COA).

CRITICAL CONSTRAINTS:
1. You MUST ONLY select an "account_code" that is present EXACTLY in the "Available Accounts" list. Copy the code character-for-character.
2. DO NOT invent new codes. DO NOT assume a "standard" chart of accounts.
3. If no account is a perfect fit, choose the closest logical match FROM THE LIST and lower your confidence.
4. If you absolutely cannot find a reasonable match, return "account_code": "UNCATEGORIZED" and set confidence to 0.

HOW TO CHOOSE WELL:
- Identify the VENDOR/MERCHANT and the NATURE of the spend first (e.g. food vendor -> meals; airline/hotel -> travel; software vendor -> subscriptions/IT).
- If "Learned Examples From This Organization" are provided below, they are PRIOR HUMAN-VERIFIED decisions for this exact business. Treat a close match there as the strongest possible signal and follow it.
- Distinguish assets from expenses (e.g. a "Laptop" is usually "Office Equipment"/"Assets", not "Office Supplies").

Output format — return ONLY a JSON object:
- "account_code": the EXACT code of the selected account from the provided list.
- "confidence": number between 0 and 1.
- "reasoning": one short sentence naming the vendor/nature and why this account fits.
`;

export const buildCategorizationPrompt = (
    accounts: any[],
    description: string,
    amount: number,
    receiptData?: any,
    examples?: CategorizationExample[]
) => {
    const accountsList = accounts
        .map(a => `- [${a.code}] ${a.name}: ${a.description || ''}`)
        .join('\n');

    let examplesBlock = '';
    if (examples && examples.length > 0) {
        const lines = examples
            .map(e => `- "${e.description}" -> [${e.account_code}]${e.account_name ? ` ${e.account_name}` : ''}`)
            .join('\n');
        examplesBlock = `
Learned Examples From This Organization (human-verified — prefer these when the new transaction is similar):
${lines}
`;
    }

    let receiptContext = '';
    if (receiptData) {
        receiptContext = `
Additional Context from Receipt:
- Vendor: ${receiptData.source_receipt_vendor || receiptData.vendor || 'Unknown'}
- Extracted Description: "${receiptData.extracted_description || receiptData.description || ''}"
- AI Matching Reasoning: ${receiptData.reasoning || ''}
`;
    }

    return `
Available Accounts:
${accountsList}
${examplesBlock}
Transaction to Categorize:
Description: "${description}"
Amount: ${amount}
${receiptContext}

Remember to return ONLY JSON, using an EXACT account_code from the Available Accounts list.
`;
};
