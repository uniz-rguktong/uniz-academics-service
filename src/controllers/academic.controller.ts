import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

import { redis } from '../utils/redis.util';

export const getGrades = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false });
    
    try {
        const cacheKey = `grades:${user.username}`;
        
        // 1. Try Redis Cache first
        const cachedGrades = await redis.get(cacheKey);
        if (cachedGrades) {
            return res.json({ success: true, grades: JSON.parse(cachedGrades), source: 'cache' });
        }

        // 2. Database Fallback
        const grades = await prisma.grade.findMany({
            where: { studentId: user.username },
            include: { subject: true }
        });

        // 3. Save to Redis for 5 minutes
        await redis.setex(cacheKey, 300, JSON.stringify(grades));

        return res.json({ success: true, grades, source: 'db' });
    } catch (e: any) {
        console.error("getGrades error:", e);
        return res.status(500).json({ success: false, message: e.message });
    }
};

export const addGrades = async (req: AuthenticatedRequest, res: Response) => {
    const { studentId, semesterId, grades } = req.body;
    
    try {
        const results = await Promise.all(grades.map((g: any) => 
            prisma.grade.upsert({
                where: { studentId_subjectId_semesterId: { studentId, subjectId: g.subjectId, semesterId } },
                update: { grade: g.grade },
                create: { studentId, subjectId: g.subjectId, semesterId, grade: g.grade }
            })
        ));

        // Invalidate Cache
        await redis.del(`grades:${studentId}`);

        return res.json({ success: true, count: results.length });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};

export const getAttendance = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false });

    try {
        const attendance = await prisma.attendance.findMany({
            where: { studentId: user.username },
            include: { subject: true }
        });
        return res.json({ success: true, attendance });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};

export const addAttendance = async (req: AuthenticatedRequest, res: Response) => {
    const { subjectId, records } = req.body;
    
    try {
        const results = await Promise.all(records.map((r: any) => 
            prisma.attendance.upsert({
                where: { studentId_subjectId_semesterId: { studentId: r.studentId, subjectId, semesterId: r.semesterId || 'CURRENT' } },
                update: { attendedClasses: r.attended, totalClasses: r.total },
                create: { studentId: r.studentId, subjectId, semesterId: r.semesterId || 'CURRENT', attendedClasses: r.attended, totalClasses: r.total }
            })
        ));
        return res.json({ success: true, count: results.length });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};

export const getSubjects = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const subjects = await prisma.subject.findMany();
        return res.json({ success: true, subjects });
    } catch (e) {
        return res.status(500).json({ success: false });
    }
};
export const addSubject = async (req: AuthenticatedRequest, res: Response) => {
    const { code, name, credits, department, semester } = req.body;
    // Basic Admin check? For now open or let auth middleware handle basic auth.
    // Ideally should check for admin role.
    const user = req.user;
    // Allow if user is admin or for seeding purposes if we trust the caller (authenticated).
    
    try {
        const subject = await prisma.subject.upsert({
            where: { code },
            update: { name, credits, department, semester },
            create: { code, name, credits, department, semester }
        });
        return res.json({ success: true, subject });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
