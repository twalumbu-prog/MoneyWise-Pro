import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    listCustomers,
    createCustomer,
    getCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerTransactions
} from '../controllers/crm.controller';

const router = Router();

router.use(requireAuth);

router.get('/customers', listCustomers);
router.post('/customers', createCustomer);
router.get('/customers/:id', getCustomer);
router.patch('/customers/:id', updateCustomer);
router.delete('/customers/:id', deleteCustomer);
router.get('/customers/:id/transactions', getCustomerTransactions);

export default router;
