/**
 * MoneyWise Public API v1
 * Auth: Bearer <mwp_live_...> or X-Api-Key: <mwp_live_...>
 */
import { Router } from 'express';
import { requireApiKey, requireScope } from '../middleware/apiKey';
import {
    getOrganization,
    getWallets,
    getTransactions,
    getAccounts,
    getBalanceSummary,
    getRequisitions,
    getRequisitionById,
    getProducts,
    getPaymentLinks,
    createPaymentLink,
} from '../controllers/publicApi.controller';

const router = Router();

router.use(requireApiKey);

// ── Meta ──────────────────────────────────────────────────────────────────────
router.get('/organization', requireScope('read'), getOrganization);

// ── Finance ───────────────────────────────────────────────────────────────────
router.get('/wallets', requireScope('read'), getWallets);
router.get('/balance', requireScope('read'), getBalanceSummary);
router.get('/transactions', requireScope('read'), getTransactions);
router.get('/accounts', requireScope('read'), getAccounts);

// ── Requisitions ──────────────────────────────────────────────────────────────
router.get('/requisitions', requireScope('read'), getRequisitions);
router.get('/requisitions/:id', requireScope('read'), getRequisitionById);

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products', requireScope('read'), getProducts);

// ── Payment Links ─────────────────────────────────────────────────────────────
router.get('/payment-links', requireScope('read'), getPaymentLinks);
router.post('/payment-links', requireScope('write'), createPaymentLink);

export default router;
