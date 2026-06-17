import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from '../controllers/department.controller';

const router = Router();

router.use(requireAuth);

router.get('/', listDepartments);
router.post('/', createDepartment);
router.patch('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);

export default router;
