import { Router } from 'express';
import {
    getScheduledItems,
    getScheduledItemCounts,
    createScheduledItem,
    updateScheduledItem,
    deleteScheduledItem,
    getScheduledItemRuns,
    runScheduledItemNow,
} from '../controllers/schedule.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/counts', getScheduledItemCounts);
router.get('/', getScheduledItems);
router.post('/', createScheduledItem);
router.patch('/:id', updateScheduledItem);
router.delete('/:id', deleteScheduledItem);
router.get('/:id/runs', getScheduledItemRuns);
router.post('/:id/run-now', runScheduledItemNow);

export default router;
