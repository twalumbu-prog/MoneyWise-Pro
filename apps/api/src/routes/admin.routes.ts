import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import {
    whoami,
    getReconciliationList,
    getOrgReconciliation,
} from '../controllers/admin.reconciliation.controller';

const router = Router();

// Every /admin route requires a valid Supabase session AND super-admin allowlisting.
router.use(requireAuth, requireSuperAdmin);

router.get('/me', whoami);
router.get('/reconciliation', getReconciliationList);
router.get('/reconciliation/:orgId', getOrgReconciliation);

export default router;
