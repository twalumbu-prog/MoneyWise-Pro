/**
 * OCR Service — uses Gemini Vision to extract structured data from receipt images.
 */

export interface ReceiptOcrData {
    vendor?: string | null;
    vendor_address?: string | null;
    date?: string | null;         // ISO 8601 date string e.g. "2025-12-25"
    time?: string | null;
    total_amount?: number | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    vat_rate?: number | null;     // percentage e.g. 16 for 16%
    currency?: string | null;     // e.g. "ZMW", "USD"
    payment_method?: string | null;
    receipt_number?: string | null;
    til_number?: string | null;
    line_items?: Array<{
        description: string;
        quantity?: number;
        unit_price?: number;
        total?: number;
    }>;
    notes?: string | null;
    raw_text?: string | null;
    confidence?: number;           // 0-1
    error?: string | null;
}

const RECEIPT_ANALYSIS_PROMPT = `You are a receipt data extraction specialist. Analyze this receipt image and extract as much structured information as possible.

Return a JSON object with the following fields (use null for fields not found):
{
  "vendor": "Store or business name",
  "vendor_address": "Physical address of the vendor",
  "date": "Date of purchase in ISO format YYYY-MM-DD (convert from any format)",
  "time": "Time of purchase e.g. 14:30",
  "total_amount": 0.00,
  "subtotal": 0.00,
  "vat_amount": 0.00,
  "vat_rate": 0,
  "currency": "Currency code e.g. ZMW, USD, GBP",
  "payment_method": "Cash, Card, Mobile Money, etc.",
  "receipt_number": "Receipt or invoice number",
  "til_number": "Till or terminal number if present",
  "line_items": [
    {
      "description": "Item name",
      "quantity": 1,
      "unit_price": 0.00,
      "total": 0.00
    }
  ],
  "notes": "Any other relevant information (e.g. discounts, tax IDs, etc.)",
  "raw_text": "Full verbatim text extracted from the receipt",
  "confidence": 0.95
}

Be accurate with numbers. For VAT (Value Added Tax), look for entries like VAT, GST, Tax, or percentages near total amounts.

IMPORTANT: Even if a receipt is extremely simple and lacks a formal table of items (e.g., a toll gate receipt or a single-item retail receipt), you MUST identify the primary item or service being charged for and include it in the 'line_items' array. Use the most descriptive text available on the receipt for the description (e.g. 'Toll Fee' rather than just 'Total').`;

const ITEM_MATCHING_PROMPT = `You are a financial reconciliation expert. Your task is to match line items extracted from a receipt to the original requested items in a requisition.

Requested Items (from our records):
{{requested_items}}

Extracted Items (found on the uploaded receipts):
{{extracted_items}}

### MATCHING RULES:
1. **Semantic Context is King**: Rely heavily on the 'description' AND the 'source_receipt_vendor' (if available). For example, if the vendor is "Mount Meru Petroleum" and the receipt item is "Low Sulphur Die sel", it is OBVIOUSLY a match for a requested item named "fuel".
2. **Amounts are just Estimates**: The "amount" in requested items is an ESTIMATE and will often differ from the receipt's actual amount. Do NOT rely strictly on amounts aligning. Use them as secondary clues.
3. **Handle Terminology**: "total" in extracted items corresponds to the actual spent amount.
4. **Multiple Receipts**: If multiple receipts were uploaded, the "Extracted Items" list contains items from all of them. Use the vendor name to differentiate them.
5. **Confidence**: If the semantic context (vendor + description) points strongly to a requested item, match it with high confidence (>0.8) even if the amounts differ significantly.

Return ONLY a JSON object:
{
  "matches": [
    {
      "requested_item_id": "ID of the requested item",
      "extracted_description": "Description found on receipt",
      "extracted_amount": 0.00, // The numerical total for this item from the receipt
      "source_receipt_id": "The exact ID of the receipt this item came from (as provided in extracted_items)",
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation"
    }
  ],
  "unmatched_extracted": ["Descriptions of receipt items that didn't match anything"],
  "unmatched_requested_ids": ["IDs of requested items that have no match"]
}
`;

export const ocrService = {
    async analyzeReceipt(imageUrl?: string, imageData?: Buffer | Uint8Array): Promise<ReceiptOcrData> {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
            console.warn('[OCR Service] Gemini API key not configured. Cannot analyze receipt.');
            return { error: 'AI analysis not configured', confidence: 0 };
        }

        try {
            let base64Data: string;

            if (imageData) {
                base64Data = Buffer.from(imageData).toString('base64');
                console.log(`[OCR Service] Using provided image data, size: ${Math.round(base64Data.length / 1024)} KB`);
            } else if (imageUrl) {
                console.log(`[OCR Service] Fetching image from URL: ${imageUrl.split('?')[0]}`);
                base64Data = await this.fetchImageAsBase64(imageUrl);
                console.log(`[OCR Service] Fetched Base64 from URL, size: ${Math.round(base64Data.length / 1024)} KB`);
            } else {
                throw new Error('Either imageUrl or imageData must be provided');
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
            
            const payload = {
                contents: [{
                    parts: [
                        { text: RECEIPT_ANALYSIS_PROMPT },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: base64Data
                            }
                        }
                    ]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.1,
                    maxOutputTokens: 2048
                }
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for Gemini

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errBody = await response.text();
                console.error('[OCR Service] Gemini Vision API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errBody
                });
                throw new Error(`Gemini API Status ${response.status}: ${errBody}`);
            }

            const data = await response.json();
            
            if (!data.candidates || data.candidates.length === 0) {
                console.error('[OCR Service] No candidates in Gemini response:', JSON.stringify(data));
                throw new Error('No analysis candidates returned from Gemini');
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.error('[OCR Service] No text in first candidate parts:', JSON.stringify(data.candidates[0]));
                throw new Error('Empty response text from Gemini Vision');
            }

            const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
            const parsed: ReceiptOcrData = JSON.parse(jsonText);

            console.log(`[OCR Service] Successfully analyzed receipt. Vendor: ${parsed.vendor}, Total: ${parsed.total_amount}`);
            return parsed;

        } catch (error: any) {
            console.error('[OCR Service] Critical failure during analysis:', {
                message: error.message,
                stack: error.stack
            });
            return { error: `Analysis failed: ${error.message}`, confidence: 0 };
        }
    },

    async matchExtractedItems(requestedItems: any[], extractedItems: any[]): Promise<any> {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') return null;

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
            
            const prompt = ITEM_MATCHING_PROMPT
                .replace('{{requested_items}}', JSON.stringify(requestedItems, null, 2))
                .replace('{{extracted_items}}', JSON.stringify(extractedItems, null, 2));

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
                })
            });

            if (!response.ok) throw new Error(`Gemini API Match Error: ${response.status}`);
            
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return null;

            return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
        } catch (error: any) {
            console.error('[OCR Service] Matching failed:', error.message);
            return null;
        }
    },

    async fetchImageAsBase64(url: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for image fetch

        try {
            console.log(`[OCR] Fetching image for base64 conversion: ${url.split('?')[0]}`);
            const response = await fetch(url, { signal: controller.signal as any });
            if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
            
            clearTimeout(timeoutId);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            return base64;
        } catch (error: any) {
            console.error('[OCR] fetchImageAsBase64 failed:', error.message);
            throw error;
        }
    }
};

