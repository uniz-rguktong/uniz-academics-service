import { Router } from 'express';
import { getGrades, addGrades, getAttendance, addAttendance, getSubjects, addSubject, publishResults } from '../controllers/academic.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);


router.get('/grades', getGrades);
router.post('/grades/add', addGrades);
router.post('/grades/publish-email', publishResults);

router.get('/attendance', getAttendance);
router.post('/attendance/add', addAttendance);

router.get('/subjects', getSubjects);
router.post('/subjects/add', addSubject);

export default router;
