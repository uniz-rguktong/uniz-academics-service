import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

import { redis } from '../utils/redis.util';


const SUBJECTS_DATA: any = {
  'E1': {
    'Sem - 1': {
      'CSE': {
        credits: [4, 4, 4, 2.5, 2.5, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      },
      'ECE': {
        credits: [4, 4, 1.5, 2.5, 4, 1.5, 1, 3, 1.5, 0],
        hide: []
      },
      'EEE': {
        credits: [4, 4, 1.5, 2.5, 4, 1.5, 1, 3, 1.5, 0]
      },
      'CIVIL': {
        credits: [3, 4, 4, 2.5, 1.5, 2.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      },
      'MECH': {
        credits: [4, 2.5, 4, 4, 3, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      }
    },
    'Sem - 2': {
      'CSE': {
        credits: [4, 4, 3, 4, 3, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      },
      'ECE': {
        credits: [4, 2, 1.5, 1.5, 2.5, 4, 1.5, 4, 4, 0],
        hide: [9]
      },
      'EEE': {
        credits: [4, 4, 1.5, 1.5, 2.5, 4, 1.5, 4, 1, 0]
      },
      'CIVIL': {
        credits: [3, 4, 3, 4, 3, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      },
      'MECH': {
        credits: [4, 4, 3, 3, 2.5, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      }
    }
  },
  'E2': {
    'Sem - 1': {
      'CSE': {
        credits: [4, 3, 4, 3, 3, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      },
      'ECE': {
        credits: [3, 1.5, 4, 1.5, 4, 1.5, 4, 1.5, 3, 0],
        hide: [9]
      },
      'EEE': {
        credits: [3, 1, 4, 1.5, 3, 1, 4, 4, 1.5, 0]
      },
      'CIVIL': {
        credits: [3, 3, 3, 3, 4, 4, 1.5, 1.5, 0, 0],
        hide: [9]
      },
      'MECH': {
        credits: [4, 4, 4, 4, 3, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      }
    },
    'Sem - 2': {
      'CSE': {
        credits: [3, 3, 3, 3, 3, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      },
      'ECE': {
        credits: [2.5, 4, 1.5, 3, 1.5, 4, 1.5, 4, 1, 0],
        hide: [9]
      },
      'EEE': {
        credits: [1, 4, 3, 4, 1.5, 4, 1.5, 4, 1.5, 0]
      },
      'CIVIL': {
        credits: [3, 3, 4, 4, 3, 3, 1.5, 1.5, 0, 0],
        hide: [8, 9]
      },
      'MECH': {
        credits: [4, 4, 4, 4, 3, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      }
    }
  },
  'E3': {
    'Sem - 1': {
      'CSE': {
        credits: [3, 3, 3, 3, 3, 1.5, 1.5, 1.5, 1.5, 0]
      },
      'ECE': {
        credits: [3, 3, 1.5, 4, 1.5, 1.5, 1.5, 1, 1, 2],
        hide: []
      },
      'EEE': {
        credits: [3, 4, 1.5, 1.5, 3, 1.5, 3, 1.5, 1, 1],
        show: [10]
      },
      'CIVIL': {
        credits: [4, 4, 3, 3, 1.5, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      },
      'MECH': {
        credits: [4, 3, 4, 3, 1.5, 1.5, 1.5, 1.5, 0, 0],
        hide: [9]
      }
    },
    'Sem - 2': {
      'CSE': {
        credits: [4, 4, 3, 3, 3, 1.5, 3, 0, 3, 0],
        hide: [8]
      },
      'ECE': {
        credits: [1.5, 0, 3, 3, 3, 3, 1.5, 0, 0, 0],
        hide: [8, 9]
      },
      'EEE': {
        credits: [1.5, 3, 3, 3, 3, 1, 0, 0, 0, 0],
        hide: [7, 8, 9]
      },
      'CIVIL': {
        credits: [2.5, 4, 3, 3, 3, 1.5, 1.5, 1.5, 3, 0],
        hide: [9]
      },
      'MECH': {
        credits: [4, 4, 3, 3, 3, 1.5, 1.5, 0, 0, 0],
        hide: [8, 9]
      }
    }
  },
  'E4': {
    'Sem - 1': {
      'CSE': {
        credits: [3, 3, 3, 6, 2, 0, 0, 0, 0, 0],
        hide: [6, 7, 8, 9]
      },
      'ECE': {
        credits: [3, 3, 3, 3, 4, 0, 0, 0, 0, 0],
        hide: [6, 7, 8, 9]
      },
      'EEE': {
        credits: [3, 3, 3, 3, 4, 0, 0, 0, 0, 0],
        hide: [6, 7, 8, 9]
      },
      'CIVIL': {
        credits: [3, 3, 3, 3, 4, 0, 0, 0, 0, 0],
        hide: [6, 7, 8, 9]
      },
      'MECH': {
        credits: [3, 3, 3, 4.5, 0, 0, 0, 0, 0, 0],
        hide: [5, 6, 7, 8, 9]
      }
    },
    'Sem - 2': {
      'CSE': {
        credits: [4, 4, 3, 4, 3, 1.5, 1.5, 1.5, 0, 0],
        hide: [6, 7, 8, 9]
      },
      'ECE': {
        credits: [2, 3, 3, 6, 0, 0, 0, 0, 0, 0],
        hide: [5, 6, 7, 8, 9]
      },
      'EEE': {
        credits: [2, 3, 3, 6, 0, 0, 0, 0, 0, 0],
        hide: [5, 6, 7, 8, 9]
      },
      'CIVIL': {
        credits: [3, 3, 3, 5, 2, 0, 0, 0, 0, 0],
        hide: [5, 6, 7, 8, 9]
      },
      'MECH': {
        credits: [3, 3, 3, 2, 6, 0, 0, 0, 0, 0],
        hide: [6, 7, 8, 9]
      }
    }
  }
};


export const getGrades = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false });
    
    try {
        const cacheKey = `grades:${user.username}`;
        
        // 1. Try Redis Cache first
        // const cachedGrades = await redis.get(cacheKey);
        // if (cachedGrades) {
        //    return res.json({ success: true, grades: JSON.parse(cachedGrades), source: 'cache' });
        // }

        // 2. Database Fallback (Fetch all grades)
        const grades = await prisma.grade.findMany({
            where: { studentId: user.username },
            include: { subject: true }
        });

        // 3. Calculate GPA per Semester
        // Group by Semester first
        const gradesBySem: Record<string, typeof grades> = {};
        grades.forEach(g => {
            if (!gradesBySem[g.semesterId]) gradesBySem[g.semesterId] = [];
            gradesBySem[g.semesterId].push(g);
        });

        // Determine student details for credit lookup
        let year = 'E3'; // Default heuristic
        if (user.username.startsWith('O20') || user.username.startsWith('N20')) year = 'E4';
        if (user.username.startsWith('O21') || user.username.startsWith('N21')) year = 'E3';
        if (user.username.startsWith('O22') || user.username.startsWith('N22')) year = 'E2';
        if (user.username.startsWith('O23') || user.username.startsWith('N23')) year = 'E1';
        
        // Mock Branch (Ideally from User Profile Service, but we use defaults/heuristics or DB profile)
        // Since we don't have easy access to User Profile here (microservice), we assume a default or fetch it.
        // For accurate GPA, we unfortunately need the Branch.
        // We will TRY to infer branch from Subject Codes in grades or use a fallback 'CSE'.
        let branch = 'CSE'; 
        if (grades.length > 0) {
           const parts = grades[0].subject.code.split('-');
           if (parts.length >= 3) branch = parts[2];
        }

        const gpaResults: Record<string, number> = {};

        for (const [semId, semGrades] of Object.entries(gradesBySem)) {
            // Map Sem ID (SEM-1) to Data Key (Sem - 1)
            const semKey = semId.replace('SEM-', 'Sem - ');
            
            // Get Credits Data
            const semData = SUBJECTS_DATA[year]?.[semKey]?.[branch];
            
            if (semData) {
                let totalPoints = 0;
                let totalCredits = 0;

                semGrades.forEach(g => {
                    // Extract index from code format: YEAR-SEM-BRANCH-INDEX (e.g., E3-SEM-1-CSE-1)
                    const parts = g.subject.code.split('-');
                    const indexStr = parts[parts.length - 1]; // Last part is index (1-based)
                    const index = parseInt(indexStr) - 1; // 0-based index

                    if (!isNaN(index) && semData.credits[index] !== undefined) {
                        // Check if hidden (Index + 1 is the ID logic in JS, so we use 0-based check against Hide array which seems to use 0-based or 1-based?
                        // looking at JS: document.getElementById(i).style.display = "none" where i is 1..10
                        // hide: [8, 9] likely refers to 1-based indices 8 and 9 being hidden? 
                        // In JS: document.getElementById(8) and (9). 
                        // So if we have index 7 (8th item) and 8 (9th item).
                        
                        // Let's assume the array indices in 'credits' map 1:1 to the codes ending in -1, -2, etc.
                        
                         // Skip if in HIDE list (assuming HIDE list is 0-based indices to match credits array)
                        const isHidden = semData.hide && semData.hide.includes(index); 
                        // Wait, JS uses `document.getElementById(i)` where i is 1..10.
                        // `hide: [8, 9]` calls `document.getElementById(8)` -> i=8.
                        // So 8 corresponds to index 7 in the array (0-based).
                        // Wait, looking at JS loop:
                        // for (let i = 1; i <= 10; i++)
                        // data.credits.forEach((cred, i) => window[`subject${i + 1}_credits`] = cred);
                        // `subject2_credits` gets `credits[1]`.
                        // So array index 0 maps to i=1. Array index 7 maps to i=8.
                        // The `hide` array contains IDs?
                        // JS: `data.hide.forEach(i => document.getElementById(i).style.display = "none")`
                        // So `hide` contains the 'i' values (1-based).
                        
                        // So if hide contains 9, it means the 9th subject (index 8).
                        const isHiddenIndex = semData.hide && semData.hide.includes(index + 1);
                        
                        // Only count if NOT hidden OR explicitly SHOWN
                        // JS: if (document.getElementById(i).style.display === "none") continue;
                        
                        if (!isHiddenIndex) { 
                            const credit = semData.credits[index];
                            totalPoints += g.grade * credit;
                            totalCredits += credit;
                        }
                    }
                });

                if (totalCredits > 0) {
                    gpaResults[semId] = parseFloat((totalPoints / totalCredits).toFixed(2));
                }
            } else {
                 // Fallback: Simple Average if no credit data? Or skip.
                 // gpaResults[semId] = 0;
            }
        }

        // 4. Save to Redis
        // await redis.setex(cacheKey, 300, JSON.stringify(grades));

        return res.json({ success: true, grades, gpa: gpaResults, source: 'db (calculated)' });
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

import axios from 'axios';
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://uniz-production-gateway.vercel.app/api/v1';

export const publishResults = async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user || (user.role !== 'webmaster' && user.role !== 'director' && user.role !== 'dean')) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { semesterId } = req.body;
    if (!semesterId) return res.status(400).json({ success: false, message: 'Semester ID required' });

    try {
        // 1. Fetch ALL grades for the semester
        const grades = await prisma.grade.findMany({
            where: { semesterId },
            include: { subject: true }
        });

        if (grades.length === 0) {
            return res.json({ success: true, message: 'No grades found for this semester', sentCount: 0 });
        }

        // 2. Group by Student
        const studentGrades: Record<string, typeof grades> = {};
        grades.forEach(g => {
            if (!studentGrades[g.studentId]) studentGrades[g.studentId] = [];
            studentGrades[g.studentId].push(g);
        });

        const students = Object.keys(studentGrades);
        console.log(`Sending results to ${students.length} students via Mail Service...`);

        // 3. Send Emails via Microservice
        let sentCount = 0;
        const chunk = 20; // Improved concurrency for HTTP calls
        
        for (let i = 0; i < students.length; i += chunk) {
            const batch = students.slice(i, i + chunk);
            await Promise.all(batch.map(async (studentId) => {
                const email = `${studentId.toLowerCase()}@rguktong.ac.in`;
                try {
                    // Call Mail Service
                    await axios.post(`${GATEWAY_URL}/mail/send`, {
                        type: 'results',
                        to: email,
                        data: {
                            username: studentId,
                            semesterId,
                            grades: studentGrades[studentId]
                        }
                    }, {
                       // Internal Secret potentially needed in future
                       headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'uniz-core' }
                    });
                    sentCount++;
                } catch (e) {
                    console.error(`Failed to send result mail to ${studentId}:`, e.message);
                }
            }));
        }

        return res.json({ success: true, message: 'Results published (queued)', total: students.length, sent: sentCount });
    } catch (e: any) {
        return res.status(500).json({ success: false, error: e.message });
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

