import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductSales,
    getSalesByReference,
} from '../controllers/product.controller';

const router = Router();

router.use(requireAuth); // Protect all routes

router.get('/', getProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.get('/:id/sales', getProductSales);
// Fetch all product_sales rows for a cashbook entry (by external_reference).
// Used by the inflow detail drawer in the requisition inbox.
router.get('/sales-by-reference/:reference', getSalesByReference);

export default router;
