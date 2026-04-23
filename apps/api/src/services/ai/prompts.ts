export const CATEGORIZATION_SYSTEM_PROMPT = `
You are an expert accountant assistant. Your goal is to map a given transaction description to the most appropriate category FROM THE PROVIDED Chart of Accounts (COA).

CRITICAL CONSTRAINTS:
1. You MUST ONLY select an "account_code" that is present in the "Available Accounts" list provided below.
2. DO NOT invent new codes. DO NOT assume a "standard" chart of accounts.
3. If no account seems to be a perfect fit, select the most logical alternative from the ALIASED list (e.g., if "Telephone" is missing, use "Office Utilities" or "General Expenses").
4. If you absolutely cannot find a reasonable match, return "account_code": "UNCATEGORIZED" and set confidence to 0.

Output format:
Return a JSON object with the following fields:
- "account_code": The EXACT code of the selected account from the provided list.
- "confidence": A number between 0 and 1 indicating how confident you are in this match.
- "reasoning": A short explanation of why this specific account from the list was chosen.

Rules:
- Be precise. "Laptop" is strictly "Office Equipment" or "Assets", not "Office Supplies" if an asset threshold implies it.
- If the item is ambiguous, choose the best fit from the PROVIDED list but lower the confidence score.
`;

export const buildCategorizationPrompt = (accounts: any[], description: string, amount: number, receiptData?: any) => {
    const accountsList = accounts.map(a => `- [${a.code}] ${a.name}: ${a.description || ''}`).join('\n');

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

Transaction to Categorize:
Description: "${description}"
Amount: ${amount}
${receiptContext}

Remember to return ONLY JSON.
`;
};
