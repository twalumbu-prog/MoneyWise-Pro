import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
    connectQuickBooks,
    quickBooksCallback,
    getIntegrationStatus,
    getQuickBooksAccounts,
    getQuickBooksAccountTransactions,
    getQuickBooksInvoices,
    disconnectQuickBooks,
    syncRequisition
} from '../controllers/integrations.controller';
import {
    getMasterFeesOAuthUrl,
    masterFeesOAuthCallback,
    masterFeesDiag,
    connectMasterFees,
    getMasterFeesStatus,
    disconnectMasterFees,
    getMasterFeesFeeCategories,
    updateMasterFeesCategoryMapping,
    updateMasterFeesLencoMode,
    syncMasterFeesNow,
    getMasterFeesReconciliation,
    syncAllMasterFees,
    backfillMasterFeesPayments,
    recategorizeMasterFeesInvoices,
    correctMasterFeesPaymentDates,
    syncStudentsToCrmNow,
} from '../controllers/masterfees.controller';

import {
    getMetaStatus,
    getMetaConnectUrl,
    metaOAuthCallback,
    disconnectMeta,
    metaDataDeletion,
    metaDataDeletionStatus,
    verifyMetaWebhook,
    receiveMetaWebhook,
} from '../controllers/meta.controller';

import { receiveInboundEmail } from '../services/capture/capture.email';

const router = Router();
const META_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'];

// OAuth flow
router.get('/quickbooks/connect', requireAuth, connectQuickBooks);
router.get('/quickbooks/callback', quickBooksCallback); // No auth for callback as it handles redirect
router.delete('/quickbooks', requireAuth, disconnectQuickBooks);

// Status and Data
router.get('/status', requireAuth, getIntegrationStatus);
router.get('/quickbooks/accounts', requireAuth, getQuickBooksAccounts);
router.get('/quickbooks/accounts/:qbAccountId/transactions', requireAuth, getQuickBooksAccountTransactions);
router.get('/quickbooks/invoices', requireAuth, getQuickBooksInvoices);
router.post('/quickbooks/sync/:id', requireAuth, syncRequisition);

// ── Master Fees ──────────────────────────────────────────────────────────────
// Cron sync (secured inside the handler via MASTERFEES_SYNC_SECRET/LENCO_SYNC_SECRET).
router.post('/masterfees/sync-all', syncAllMasterFees);
// One-off ops endpoint: payments-only backfill for a single org, skipping the
// invoice phase and diffing against what's already synced. Same secret gate.
router.post('/masterfees/backfill-payments', backfillMasterFeesPayments);
// One-off ops endpoint: rebuild every posted invoice's journal with the fixed
// category resolution (item.category tag, not free-text guessing).
router.post('/masterfees/recategorize-invoices', recategorizeMasterFeesInvoices);
// One-off ops endpoint: apply bank-reconciliation-derived date corrections
// to already-synced payments (journal + running-balance recalc included).
router.post('/masterfees/correct-dates', correctMasterFeesPaymentDates);

// OAuth 1-click flow.
router.get('/masterfees/oauth/url', requireAuth, getMasterFeesOAuthUrl);
router.get('/masterfees/oauth/callback', masterFeesOAuthCallback); // No auth — called by Master Fees

// TEMPORARY diagnostic endpoint — remove once the egress/IP issue is resolved.
router.get('/masterfees/diag', requireAuth, masterFeesDiag);

router.post('/masterfees/connect', requireAuth, connectMasterFees);
router.get('/masterfees/status', requireAuth, getMasterFeesStatus);
router.delete('/masterfees', requireAuth, disconnectMasterFees);
router.get('/masterfees/fee-categories', requireAuth, getMasterFeesFeeCategories);
router.put('/masterfees/fee-categories', requireAuth, updateMasterFeesCategoryMapping);
router.put('/masterfees/lenco-mode', requireAuth, updateMasterFeesLencoMode);
router.post('/masterfees/sync', requireAuth, syncMasterFeesNow);
router.post('/masterfees/sync-students', requireAuth, syncStudentsToCrmNow);
router.get('/masterfees/reconcile', requireAuth, getMasterFeesReconciliation);

// ── Meta messaging (WhatsApp / Facebook / Instagram) ─────────────────────────
// The webhook and data-deletion callback have no session: Meta signs them, and the handlers verify that signature.
router.get('/meta/webhook', verifyMetaWebhook);
router.post('/meta/webhook', receiveMetaWebhook);
router.post('/meta/data-deletion', metaDataDeletion);
router.post('/email/inbound', receiveInboundEmail);   // signed by Resend; no session
router.get('/meta/data-deletion/:code', metaDataDeletionStatus);
router.get('/meta/status', requireAuth, getMetaStatus);
router.get('/meta/connect/:platform', requireAuth, requireRole(META_ROLES), getMetaConnectUrl);
router.post('/meta/callback', requireAuth, requireRole(META_ROLES), metaOAuthCallback);
router.delete('/meta/connections/:id', requireAuth, requireRole(META_ROLES), disconnectMeta);

export default router;
