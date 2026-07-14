import { Router } from 'express';
import { ingestVercelLogDrain } from '../controllers/vercelLogDrain.controller';

const router = Router();

router.post('/vercel-log-drain', ingestVercelLogDrain);

export default router;
