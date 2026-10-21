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
    getProductById,
    createProduct,
    updateProduct,
    getPaymentLinkById,
    getPaymentLinks,
    createPaymentLink,
} from '../controllers/publicApi.controller';
import {
    listExternalWallets,
    getExternalWallet,
    getStatementLines,
    importStatementLines,
    deleteStatementImport,
} from '../controllers/externalWallets.controller';

const router = Router();

router.use(requireApiKey);

// ── Meta ──────────────────────────────────────────────────────────────────────
router.get('/organization', requireScope('read'), getOrganization);

// ── Finance ───────────────────────────────────────────────────────────────────
router.get('/wallets', requireScope('read'), getWallets);
router.get('/balance', requireScope('read'), getBalanceSummary);
router.get('/external-wallets', requireScope('read'), listExternalWallets);
router.get('/external-wallets/:id', requireScope('read'), getExternalWallet);
router.get('/external-wallets/:id/statement-lines', requireScope('read'), getStatementLines);
router.post('/external-wallets/:id/statement-lines', requireScope('write'), importStatementLines);
router.delete('/external-wallets/:id/statement-imports/:batchId', requireScope('write'), deleteStatementImport);
router.get('/transactions', requireScope('read'), getTransactions);
router.get('/accounts', requireScope('read'), getAccounts);

// ── Requisitions ──────────────────────────────────────────────────────────────
router.get('/requisitions', requireScope('read'), getRequisitions);
router.get('/requisitions/:id', requireScope('read'), getRequisitionById);

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products', requireScope('read'), getProducts);
router.get('/products/:id', requireScope('read'), getProductById);
router.post('/products', requireScope('write'), createProduct);
router.patch('/products/:id', requireScope('write'), updateProduct);

// ── Payment Links ─────────────────────────────────────────────────────────────
router.get('/payment-links', requireScope('read'), getPaymentLinks);
router.get('/payment-links/:id', requireScope('read'), getPaymentLinkById);
router.post('/payment-links', requireScope('write'), createPaymentLink);

export default router;
