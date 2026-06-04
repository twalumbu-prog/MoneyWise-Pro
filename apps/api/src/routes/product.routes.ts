import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct 
} from '../controllers/product.controller';

const router = Router();

router.use(requireAuth); // Protect all routes

router.get('/', getProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

export default router;
