import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey || apiKey.startsWith('YOUR_')) {
    console.error('❌ RESEND_API_KEY is missing or invalid in .env');
    process.exit(1);
}

const resend = new Resend(apiKey);

async function sendTestEmail() {
    const args = process.argv.slice(2);
    const toArgIndex = args.indexOf('--to');

    if (toArgIndex === -1 || !args[toArgIndex + 1]) {
        console.error('❌ Please specify a recipient using --to <email>');
        process.exit(1);
    }

    const to = args[toArgIndex + 1];
    console.log(`📧 Sending test email to: ${to}`);
    console.log(`🔑 Using API Key: ${apiKey!.slice(0, 5)}...`);

    try {
        const { data, error } = await resend.emails.send({
            from: 'MoneyWise Test <onboarding@resend.dev>', // Default testing domain for Resend
            to: [to],
            subject: 'MoneyWise API Test',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                    <h1 style="color: #4F46E5;">It Works! 🎉</h1>
                    <p>This is a test email from the MoneyWise API.</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    <p>If you received this, the Resend integration is configured correctly.</p>
                </div>
            `,
        });

        if (error) {
            console.error('❌ Failed to send email:', error);
            process.exit(1);
        }

        console.log('✅ Email sent successfully!');
        console.log('🆔 ID:', data?.id);

    } catch (err) {
        console.error('❌ Unexpected error:', err);
        process.exit(1);
    }
}

sendTestEmail();
