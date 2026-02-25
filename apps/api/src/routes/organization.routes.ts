import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth); // Protect all organization routes

router.get('/', OrganizationController.getOrganization);
router.put('/', OrganizationController.updateOrganization);
router.delete('/', OrganizationController.deleteOrganization);

export default router;
