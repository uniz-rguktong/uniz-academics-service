import { Router } from 'express';
import { getGrades, addGrades, getAttendance, addAttendance, getSubjects, addSubject } from '../controllers/academic.controller';
import { downloadAttendanceTemplate, downloadGradesTemplate, uploadAttendance, uploadGrades } from '../controllers/upload.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import multer from 'multer';

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.use(authMiddleware);

router.get('/grades', getGrades);
router.post('/grades/add', addGrades);
router.get('/grades/template', downloadGradesTemplate);
router.post('/grades/upload', upload.single('file'), uploadGrades);

router.get('/attendance', getAttendance);
router.post('/attendance/add', addAttendance);
router.get('/attendance/template', downloadAttendanceTemplate);
router.post('/attendance/upload', upload.single('file'), uploadAttendance);

router.get('/subjects', getSubjects);
router.post('/subjects/add', addSubject);

export default router;
