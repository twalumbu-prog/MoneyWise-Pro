import { supabase } from '../lib/supabase';

export interface AuditScoreBreakdown {
    timing: number;      // 0-100
    compliance: number;  // 0-100
    accuracy: number;    // 0-100
}

export class AuditService {
    /**
     * Calculates and saves the audit score for a requisition.
     * Should be called when status becomes ACCOUNTED.
     */
    static async calculateAuditScore(requisitionId: string): Promise<any> {
        console.log(`[AuditService] Calculating score for requisition ${requisitionId}...`);
        
        try {
            // 1. Fetch requisition with all necessary data
            const { data: requisition, error: reqError } = await supabase
                .from('requisitions')
                .select(`
                    id, 
                    created_at, 
                    accounted_at,
                    status,
                    estimated_total,
                    actual_total,
                    receipts (*),
                    line_items (*),
                    disbursements (*)
                `)
                .eq('id', requisitionId)
                .single();

            if (reqError || !requisition) {
                throw new Error(`Requisition ${requisitionId} not found for scoring: ${reqError?.message}`);
            }

            // --- CRITERIA 1: TIMING (33.3%) ---
            // Target: Draft to Accounted < 24h
            let timingScore = 0;
            if (requisition.accounted_at && requisition.created_at) {
                const draftDate = new Date(requisition.created_at);
                const accountedDate = new Date(requisition.accounted_at);
                const diffHours = (accountedDate.getTime() - draftDate.getTime()) / (1000 * 60 * 60);

                if (diffHours < 24) {
                    timingScore = 100; // Brilliant
                } else if (diffHours < 48) {
                    timingScore = 50;  // Average
                } else {
                    timingScore = 0;   // Bad
                }
            }

            // --- CRITERIA 2: COMPLIANCE (33.3%) ---
            // Receipts uploaded and matching line items
            let complianceScore = 0;
            const receipts = requisition.receipts || [];
            const lineItems = requisition.line_items || [];
            
            if (receipts.length === 0) {
                complianceScore = 0; // Completely terrible
            } else {
                // Check if items match. For now, we use a simple heuristic:
                // If every line item has a receipt_ocr_status of 'DONE' or a manual receipt_url.
                // AND whether the OCR data matches (if available).
                // Actually, the user says: "if the receipts were uploaded, but the items did not match that's in the middle"
                
                const itemsWithReceipts = lineItems.filter((item: any) => item.receipt_url || item.receipt_ocr_status === 'DONE');
                const allItemsHaveReceipts = itemsWithReceipts.length === lineItems.length;
                
                // Check for OCR matching failures
                const matchFailures = lineItems.filter((item: any) => item.receipt_ocr_status === 'FAILED');
                
                if (allItemsHaveReceipts && matchFailures.length === 0) {
                    complianceScore = 100; // Brilliant
                } else if (receipts.length > 0) {
                    complianceScore = 50;  // Average (in the middle)
                }
            }

            // --- CRITERIA 3: ACCURACY (33.3%) ---
            // Zero discrepancy between expected and actual change
            let accuracyScore = 100; // Default to 100 if no disbursements
            const disbursements = requisition.disbursements || [];
            
            if (disbursements.length > 0) {
                // Check if any disbursement has a non-zero discrepancy
                const hasDiscrepancy = disbursements.some((d: any) => (d.discrepancy_amount || 0) !== 0);
                if (hasDiscrepancy) {
                    accuracyScore = 0; // Automatically not ideal
                } else {
                    accuracyScore = 100; // Ideal
                }
            }

            // --- FINAL CALCULATION ---
            const breakdown: AuditScoreBreakdown = {
                timing: timingScore,
                compliance: complianceScore,
                accuracy: accuracyScore
            };

            const overallScore = (timingScore + complianceScore + accuracyScore) / 3;

            // 2. Save to database
            const { error: updateError } = await supabase
                .from('requisitions')
                .update({
                    audit_score: overallScore,
                    audit_score_breakdown: breakdown
                } as any)
                .eq('id', requisitionId);

            if (updateError) {
                console.error(`[AuditService] Failed to save score for ${requisitionId}:`, updateError);
            }

            return { score: overallScore, breakdown };
        } catch (error: any) {
            console.error(`[AuditService] Error calculating audit score:`, error);
            throw error;
        }
    }
}
