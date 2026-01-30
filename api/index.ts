import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import academicRoutes from '../src/routes/academic.routes';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'uniz-academics-service' });
});

app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'UniZ Academics Service API manages grades, attendance and curriculum.',
    health: '/health' 
  });
});

app.use('/', academicRoutes);

export default app;
