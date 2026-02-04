export const CATEGORIZATION_SYSTEM_PROMPT = `
You are an expert accountant assistant. Your goal is to map a given transaction description to the most appropriate Chart of Accounts (COA) category.

You will be provided with:
1. A list of available accounts (Code, Name, Description).
2. A line item description and estimated amount.

Output format:
Return a JSON object with the following fields:
- "account_code": The code of the selected account.
- "confidence": A number between 0 and 1 indicating how confident you are in this match.
- "reasoning": A short explanation of why this account was chosen.

Rules:
- If the item is ambiguous, choose the best fit but lower the confidence score.
- If it's clearly personal or invalid, you can suggest a "Suspense" or "Uncategorized" account if available, or just the best guess with low confidence.
- Be precise. "Laptop" is strictly "Office Equipment" or "Assets", not "Office Supplies" if an asset threshold implies it.
`;

export const buildCategorizationPrompt = (accounts: any[], description: string, amount: number) => {
    const accountsList = accounts.map(a => `- [${a.code}] ${a.name}: ${a.description || ''}`).join('\n');

    return `
Available Accounts:
${accountsList}

Transaction to Categorize:
Description: "${description}"
Amount: ${amount}

Remember to return ONLY JSON.
`;
};
