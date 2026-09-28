import { updateAIModelSettings } from './src/services/ai/ai.settings.service';

async function main() {
    await updateAIModelSettings({
        ocr_provider: 'openrouter',
        ocr_model: 'google/gemini-2.5-flash'
    });
    console.log("Updated via Supabase!");
}
main().catch(console.error);
