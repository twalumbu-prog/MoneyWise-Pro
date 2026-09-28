const { PrismaClient } = require('../../packages/database');
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.aIModelSettings.findFirst();
    if (settings) {
        await prisma.aIModelSettings.update({
            where: { id: settings.id },
            data: {
                ocr_provider: 'openrouter',
                ocr_model: 'google/gemini-2.5-flash'
            }
        });
        console.log("Updated ocr_model to google/gemini-2.5-flash on openrouter!");
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
