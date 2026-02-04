import { IncomingMessage, ServerResponse } from 'http';
import app from '../src/index';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    console.log(`[Vercel Entry] Incoming Request: ${req.method} ${req.url}`);

    try {
        // Log environment status check
        console.log('[Vercel Entry] Environment Check - NODE_ENV:', process.env.NODE_ENV);

        // Pass request to Express app
        // We cast to any to avoid strict type mismatches between Vercel/Node generic types and Express types
        app(req as any, res as any);
    } catch (error: any) {
        console.error('[Vercel Entry] FATAL ERROR:', error);
        res.statusCode = 500;
        res.end(`Internal Server Error: ${error.message}`);
    }
}
