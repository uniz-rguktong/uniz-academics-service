import { Router } from 'express';
import { getGrades, addGrades, getAttendance, addAttendance, getSubjects } from '../controllers/academic.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/grades', getGrades);
router.post('/grades/add', addGrades);

router.get('/attendance', getAttendance);
router.post('/attendance/add', addAttendance);

router.get('/subjects', getSubjects);

export default router;
