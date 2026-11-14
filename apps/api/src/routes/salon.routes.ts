import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import * as c from '../controllers/salon.controller';

/** The salon's own side: hairdressers, each day's bookings, and marking a service finished. */
const router = Router();
router.use(requireAuth);
const read = requireRole(['ADMIN', 'MANAGER', 'MANAGEMENT', 'ACCOUNTANT', 'CASHIER', 'AUTHORISER']);
router.get('/staff', read, c.staff);
router.post('/staff', requireRole(['ADMIN']), c.createStaff);
router.put('/staff/:id', requireRole(['ADMIN']), c.updateStaff);
router.get('/bookings', read, c.bookings);
// Any signed-in user may try: the service itself allows managers and the hairdresser who did the work.
router.post('/bookings/:id/complete', c.complete);

export default router;
