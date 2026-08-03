import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
    listStaff,
    getStaffMember,
    createStaffMember,
    updateStaffMember,
    archiveStaffMember,
    getStaffPayrollHistory,
    getStaffDepartments,
    listPayrollRuns,
    getPayrollRun,
    createPayrollRun,
    approvePayrollRun,
} from '../controllers/payroll.controller';

const router = Router();

router.use(requireAuth);

// Staff
router.get('/staff', listStaff);
router.get('/staff/departments', getStaffDepartments);
router.get('/staff/:id', getStaffMember);
router.post('/staff', createStaffMember);
router.patch('/staff/:id', updateStaffMember);
router.delete('/staff/:id', archiveStaffMember);
router.get('/staff/:id/history', getStaffPayrollHistory);

// Runs
router.get('/runs', listPayrollRuns);
router.get('/runs/:id', getPayrollRun);
router.post('/runs', createPayrollRun);
router.post('/runs/:id/approve', approvePayrollRun);

export default router;
