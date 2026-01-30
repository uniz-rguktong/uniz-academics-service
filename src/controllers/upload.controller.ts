import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

// --- Templates ---

export const downloadAttendanceTemplate = async (req: AuthenticatedRequest, res: Response) => {
    // Define headers
    const headers = [
        ['Student ID', 'Subject Code', 'Semester', 'Attended Classes', 'Total Classes'],
        ['O210001', 'E1-SEM-1-CSE-1', 'SEM-1', 25, 30] // Example row with realistic code
    ];
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(headers);
    xlsx.utils.book_append_sheet(wb, ws, 'Attendance Template');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Attendance_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

export const downloadGradesTemplate = async (req: AuthenticatedRequest, res: Response) => {
    const headers = [
        ['Student ID', 'Subject Code', 'Semester', 'Grade'],
        ['O210001', 'E1-SEM-1-CSE-1', 'SEM-1', 9] // Example row
    ];
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(headers);
    xlsx.utils.book_append_sheet(wb, ws, 'Grades Template');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="Grades_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
};

// --- Uploads ---

export const uploadAttendance = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    try {
        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet) as any[]; // Array of objects
        
        let successCount = 0;
        let failCount = 0;
        const errors: any[] = [];

        for (const row of data) {
            // Helper to get value loosely
            let studentId = row['Student ID'];
            let subjectCode = row['Subject Code'];
            const semester = row['Semester'];
            const attended = Number(row['Attended Classes']);
            const total = Number(row['Total Classes']);
            
            if (!studentId || !subjectCode || !semester) {
                failCount++;
                continue;
            }

            // Normalize
            studentId = String(studentId).toUpperCase();
            subjectCode = String(subjectCode).toUpperCase();

            // Find Subject ID by Code
            const subject = await prisma.subject.findUnique({ where: { code: subjectCode } });
            if (!subject) {
                errors.push(`Subject code not found: ${subjectCode} for student ${studentId}`);
                failCount++;
                continue;
            }
            
            try {
                await prisma.attendance.upsert({
                    where: { 
                        studentId_subjectId_semesterId: { 
                            studentId, 
                            subjectId: subject.id, 
                            semesterId: semester 
                        } 
                    },
                    update: { attendedClasses: attended, totalClasses: total },
                    create: { studentId, subjectId: subject.id, semesterId: semester, attendedClasses: attended, totalClasses: total }
                });
                successCount++;
            } catch (e: any) {
                errors.push(`Failed for ${studentId}: ${e.message}`);
                failCount++;
            }
        }
        
        return res.json({ success: true, processed: data.length, successCount, failCount, errors });

    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
};

export const uploadGrades = async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    try {
        const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet) as any[];
        
        let successCount = 0;
        let failCount = 0;
        const errors: any[] = [];

        for (const row of data) {
            let studentId = row['Student ID'];
            let subjectCode = row['Subject Code'];
            const semester = row['Semester'];
            const grade = Number(row['Grade']); // Assuming float/int
            
            if (!studentId || !subjectCode || !semester || isNaN(grade)) {
                failCount++;
                continue;
            }

            studentId = String(studentId).toUpperCase();
            subjectCode = String(subjectCode).toUpperCase();

            const subject = await prisma.subject.findUnique({ where: { code: subjectCode } });
            if (!subject) {
                errors.push(`Subject code not found: ${subjectCode}`);
                failCount++;
                continue;
            }
            
            try {
                await prisma.grade.upsert({
                    where: { 
                        studentId_subjectId_semesterId: { 
                            studentId, 
                            subjectId: subject.id, 
                            semesterId: semester 
                        } 
                    },
                    update: { grade },
                    create: { studentId, subjectId: subject.id, semesterId: semester, grade }
                });
                successCount++;
            } catch (e: any) {
                errors.push(`Failed for ${studentId}: ${e.message}`);
                failCount++;
            }
        }
        
        return res.json({ success: true, processed: data.length, successCount, failCount, errors });

    } catch (e: any) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
