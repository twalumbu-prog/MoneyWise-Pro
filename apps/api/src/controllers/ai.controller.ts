import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { intelligenceTools } from '../services/ai/intelligence.tools';
import { intelligenceToolSchemas } from '../services/ai/intelligence.tools.schema';

const GEMINI_MODEL = 'gemini-2.5-flash';

export const assistantChat = async (req: AuthRequest, res: Response) => {
    try {
        const { message, history = [] } = req.body;
        const organizationId = req.user?.organization_id;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

        const today = new Date().toLocaleDateString('en-GB', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        // 1. Define Tools for Gemini
        const tools = [{ functionDeclarations: intelligenceToolSchemas }];

        // 2. Initial Prompt with Schema & Reasoning Instructions
        const schemaInfo = `
        DATABASE SCHEMA:
        1. TABLE 'requisitions':
           - id: UUID
           - description: String
           - department: String
           - type: String
           - actual_total: Number
           - created_at: Timestamp

        2. TABLE 'line_items':
           - id: UUID
           - requisition_id: UUID
           - description: String
           - quantity: Number
           - actual_amount: Number
        `;

        const systemPrompt = `You are the MoneyWise Pro Financial Agent.
        TODAY: ${today}
        ORG: ${organizationId}
        ${schemaInfo}

        PROTOCOL:
        1. THOUGHT: Start every response with "Thought: [your reasoning]".
        2. DATA: If you need data, call tools immediately after your thought in the same turn.
        3. DRILL-DOWN: To find specific items (like "chicken"), first search_requisitions, then get_batch_requisition_details for the IDs you found.
        4. CURRENCY: All amounts in ZMW (K).
        5. REPORT: End with a professional Markdown summary.`;

        // 3. Conversation Loop
        let chatHistory: any[] = [
            { role: 'user', parts: [{ text: systemPrompt + "\n\nUser: " + message }] }
        ];

        let turnCount = 0;
        let finalReply = "";
        const MAX_TURNS = 10;

        while (turnCount < MAX_TURNS) {
            const isLastTurn = turnCount === MAX_TURNS - 1;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    contents: chatHistory, 
                    tools: isLastTurn ? undefined : tools 
                })
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Gemini API error: ${errBody}`);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate?.content) break;

            const aiResponseParts = candidate.content.parts || [];
            chatHistory.push(candidate.content);

            // Process all parts in this turn
            let hasFunctionCall = false;
            const functionResponses: any[] = [];

            for (const part of aiResponseParts) {
                if (part.functionCall) {
                    hasFunctionCall = true;
                    const { name, args } = part.functionCall;
                    console.log(`[Agent] Turn ${turnCount}: Executing ${name}`);

                    let toolResult: any;
                    try {
                        if (name === "get_organization_info") {
                            toolResult = await intelligenceTools.get_organization_info(organizationId);
                        } else if (name === "get_requisition_details") {
                            toolResult = await intelligenceTools.get_requisition_details(organizationId, args.requisitionId);
                        } else if (name === "get_batch_requisition_details") {
                            toolResult = await intelligenceTools.get_batch_requisition_details(organizationId, args.requisitionIds);
                        } else if (name === "get_financial_summary") {
                            toolResult = await intelligenceTools.get_financial_summary(organizationId, args.params || args);
                        } else if (name === "search_requisitions") {
                            toolResult = await intelligenceTools.search_requisitions(organizationId, args.params || args);
                        }
                    } catch (e: any) {
                        toolResult = { error: e.message };
                    }

                    // Metadata trimming for context window optimization
                    if (Array.isArray(toolResult)) {
                        toolResult = toolResult.map((r: any) => {
                            if (r.line_items) r.line_items = r.line_items.map((li: any) => {
                                const { id, requisition_id, ...clean } = li;
                                return clean;
                            });
                            return r;
                        });
                    }

                    functionResponses.push({
                        functionResponse: { name, response: { result: toolResult } }
                    });
                } else if (part.text) {
                    finalReply = part.text; // Accumulate or update final response
                }
            }

            if (hasFunctionCall && !isLastTurn) {
                chatHistory.push({
                    role: 'function',
                    parts: functionResponses
                });
                turnCount++;
            } else {
                // If no function calls or it's the last turn, this is our final answer
                break;
            }
        }

        res.json({ reply: finalReply });
    } catch (error: any) {
        console.error('[Assistant] Chat error:', error);
        res.status(500).json({ 
            error: 'Assistant failed to process your request',
            details: error.message
        });
    }
};
