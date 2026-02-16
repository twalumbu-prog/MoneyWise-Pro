import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/user.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getUsers);
router.post('/', createUser); // Admin only check inside controller
router.put('/:id', updateUser); // Admin only check inside controller
router.delete('/:id', deleteUser); // Admin only check inside controller

export default router;
