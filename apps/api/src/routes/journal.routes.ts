import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { postJournal, listJournalEntries, getJournalEntry, reverseJournalEntry } from '../controllers/journal.controller';

const router = Router();
router.use(requireAuth);

// Posting to the general ledger is an accounting action.
router.post('/', requireRole(['ACCOUNTANT', 'ADMIN']), postJournal);
router.get('/', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), listJournalEntries);
router.get('/:id', requireRole(['AUTHORISER', 'ACCOUNTANT', 'ADMIN', 'MANAGEMENT']), getJournalEntry);
router.post('/:id/reverse', requireRole(['ACCOUNTANT', 'ADMIN']), reverseJournalEntry);

export default router;
