import { IncomingMessage, ServerResponse } from 'http';

// We use a dynamic handler to catch errors that happen during the IMPORT of the main app.
// If src/index.ts throws an error at the top level (like a DB connection failure),
// a static import would crash the process before this handler runs.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
    console.log(`[Vercel Barrier] Incoming Request: ${req.method} ${req.url}`);

    try {
        console.log('[Vercel Barrier] Dynamically importing Express app...');

        // Dynamic import strictly inside the try-catch block
        // This ensures if '../src/index' crashes on load, we catch it here.
        const appModule = await import('../src/index');
        const app = appModule.default;

        console.log('[Vercel Barrier] Import successful. Dispatching request...');

        // Pass request to Express app
        app(req as any, res as any);

    } catch (error: any) {
        console.error('[Vercel Barrier] CRITICAL BOOT ERROR:', error);

        // Try to send error to client
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`CRITICAL BOOT ERROR: ${error.message}\n\nStack:\n${error.stack}`);
        }
    }
}
