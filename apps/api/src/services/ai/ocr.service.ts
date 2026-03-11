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

Be accurate with numbers. For VAT (Value Added Tax), look for entries like VAT, GST, Tax, or percentages near total amounts.`;

export const ocrService = {
    async analyzeReceipt(imageUrl: string): Promise<ReceiptOcrData> {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
            console.warn('[OCR Service] Gemini API key not configured. Cannot analyze receipt.');
            return { error: 'AI analysis not configured', confidence: 0 };
        }

        try {
            // Determine if this is a storage path or full URL
            const fullUrl = imageUrl.startsWith('http') ? imageUrl : imageUrl;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

            const payload = {
                contents: [{
                    parts: [
                        { text: RECEIPT_ANALYSIS_PROMPT },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: await this.fetchImageAsBase64(fullUrl)
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

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errBody = await response.text();
                console.error('[OCR Service] Gemini Vision API Error:', errBody);
                throw new Error(`Gemini API Status ${response.status}`);
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) throw new Error('Empty response from Gemini Vision');

            const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
            const parsed: ReceiptOcrData = JSON.parse(jsonText);

            console.log(`[OCR Service] Successfully analyzed receipt. Vendor: ${parsed.vendor}, Total: ${parsed.total_amount}`);
            return parsed;

        } catch (error: any) {
            console.error('[OCR Service] Failed to analyze receipt:', error.message);
            return { error: error.message, confidence: 0 };
        }
    },

    async fetchImageAsBase64(url: string): Promise<string> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        return btoa(binary);
    }
};
