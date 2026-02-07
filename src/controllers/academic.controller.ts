import { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import * as XLSX from "xlsx";
import axios from "axios";
import prisma from "../utils/prisma.util";

const GATEWAY_URL =
  process.env.GATEWAY_URL || "https://uniz-gateway.vercel.app/api/v1";

const getHeaders = (token: string) => ({ headers: { Authorization: token } });

import { redis } from "../utils/redis.util";
import { generateMotivation } from "../utils/ai.util";

// GPA calculation and templates now use database-provided subject credits.
const GRADE_MAP: Record<string, number> = {
  EX: 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  R: 0,
};

const mapGradeToPoint = (val: string | number): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const upper = String(val).toUpperCase().trim();
  return GRADE_MAP[upper] ?? (parseFloat(upper) || 0);
};

export const getUploadProgress = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (!user)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    // Check Upload Progress first
    const uploadKey = `upload:progress:${user.username}`;
    const uploadProgress = await redis.get(uploadKey);
    if (uploadProgress) {
      return res.json({ success: true, progress: JSON.parse(uploadProgress) });
    }

    // Fallback to Publish Progress
    const publishKey = `publish:progress:${user.username}`;
    const publishProgress = await redis.get(publishKey);
    if (publishProgress) {
      return res.json({ success: true, progress: JSON.parse(publishProgress) });
    }

    return res.json({ success: true, progress: { status: "idle" } });
  } catch (e: any) {
    console.error("Progress fetch error:", e);
    return res
      .status(500)
      .json({
        success: false,
        message: "Unable to retrieve progress at this time.",
      });
  }
};

export const getPublishProgress = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (!user) {
    console.log("Publish progress error: No user in request");
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const key = `publish:progress:${user.username}`;
    const progress = await redis.get(key);
    console.log(
      `Fetching publish progress for ${user.username}, key: ${key}, found: ${!!progress}`,
    );

    return res.status(200).json({
      success: true,
      progress: progress ? JSON.parse(progress) : { status: "idle" },
    });
  } catch (e: any) {
    console.error("Publish progress fetch error:", e);
    return res
      .status(500)
      .json({
        success: false,
        message: "Unable to retrieve publish progress.",
      });
  }
};

export const getBatchGrades = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (!user || user.role === "student")
    return res
      .status(403)
      .json({ success: false, message: "Students cannot access batch grades" });

  const { branch, year, semesterId, failedOnly } = req.query;

  try {
    let semesterIdFilter: any = undefined;
    const sem = semesterId as string;
    const y = year as string;

    if (sem && y) {
      // If input is "SEM-2" and "E3", look for "E3-SEM-2"
      // If input is already "E3-SEM-2", allow it directly
      if (sem.includes(y)) {
        semesterIdFilter = sem;
      } else {
        semesterIdFilter = `${y.toUpperCase()}-${sem.toUpperCase()}`;
      }
    } else if (sem) {
      semesterIdFilter = { endsWith: `-${sem.toUpperCase()}` };
    }

    const where: any = {
      semesterId: semesterIdFilter || undefined,
      subject: {
        department: (branch as string) || undefined,
        // Removed strict subject.semester match as it might conflict with canonical semesterId logic
        code: year ? { contains: `-${year}-` } : undefined,
      },
    };

    if (failedOnly === "true") {
      where.grade = { lte: 0 }; // 'R' grade and point 0 are failures
    }

    const grades = await prisma.grade.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        grade: true,
        semesterId: true,
        subject: {
          select: {
            code: true,
            name: true,
            credits: true,
          },
        },
      },
    });

    // Fetch student profiles for context
    const studentIds = [...new Set(grades.map((g) => g.studentId))];
    let studentProfiles: any[] = [];

    try {
      if (studentIds.length > 0) {
        // OPTIMIZATION: Use internal search for batch context if possible,
        // but since user-service might be on a different Vercel instance, we use Gateway with high limit for batching.
        const profilesRes = await axios.post(
          `${GATEWAY_URL}/profile/student/search`,
          {
            branch: branch || undefined,
            year: year || undefined,
            limit: 2000,
          },
          getHeaders(req.headers.authorization || ""),
        );
        studentProfiles = profilesRes.data.students || [];
      }
    } catch (err) {
      console.warn("Failed to fetch student profiles for batch grades:", err);
    }

    // Create a lookup map for profiles
    const profileMap = new Map(
      studentProfiles.map((p: any) => [p.username, p]),
    );

    // Group by Student
    const grouped: Record<string, any> = {};

    grades.forEach((g) => {
      if (!grouped[g.studentId]) {
        const profile = profileMap.get(g.studentId) || {};
        grouped[g.studentId] = {
          studentId: g.studentId,
          name: profile.name || "Unknown",
          branch: profile.branch || branch || "N/A",
          year: profile.year || year || "N/A",
          batch: profile.batch || "N/A",
          records: [],
        };
      }
      grouped[g.studentId].records.push({
        subjectCode: g.subject.code,
        subjectName: g.subject.name,
        grade: g.grade,
        credits: g.subject.credits,
        semesterId: g.semesterId,
        id: g.id,
      });
    });

    const studentsList = Object.values(grouped);

    return res.json({
      success: true,
      summary: {
        totalStudents: studentsList.length,
        totalRecords: grades.length,
        failedRecords: grades.filter((g) => g.grade <= 0).length,
        timestamp: new Date().toISOString(),
      },
      students: studentsList,
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to retrieve batch grades at this time.",
      });
  }
};

export const getGrades = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false });

  const targetStudentId = (
    (req.query.studentId as string) || user.username
  ).toUpperCase();

  // Security check
  if (targetStudentId !== user.username && user.role === "student") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const { semester, year } = req.query;
  const sem = semester as string;
  const y = year as string;

  try {
    const isFiltered = sem || y;
    const cacheKey = `grades:${targetStudentId.toUpperCase()}`;

    if (!isFiltered) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ ...JSON.parse(cached), source: "cache" });
      }
    }

    const where: any = {
      studentId: { equals: targetStudentId, mode: "insensitive" },
    };

    let semesterIdFilter: any = undefined;
    if (sem && y) {
      semesterIdFilter = `${y.toUpperCase()}-${sem.toUpperCase()}`;
    } else if (sem) {
      semesterIdFilter = { endsWith: `-${sem.toUpperCase()}` };
    } else if (y) {
      semesterIdFilter = { startsWith: `${y.toUpperCase()}-` };
    }

    if (semesterIdFilter) {
      where.semesterId = semesterIdFilter;
    }

    // Parallel DB Queries with Field selection
    const [grades, attendance] = await Promise.all([
      prisma.grade.findMany({
        where,
        select: {
          id: true,
          semesterId: true,
          grade: true,
          subject: {
            select: {
              code: true,
              name: true,
              credits: true,
              department: true,
            },
          },
        },
        orderBy: { semesterId: "desc" },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: targetStudentId,
          semesterId: semesterIdFilter || undefined,
        },
        select: {
          id: true,
          semesterId: true,
          totalClasses: true,
          attendedClasses: true,
          subjectId: true,
        },
      }),
    ]);

    // Calculate GPA per Semester using Real-time DB Credits
    const gpaResults: Record<string, any> = {};
    const semPoints: Record<string, number> = {};
    const semCredits: Record<string, number> = {};
    const semFails: Record<string, boolean> = {};

    grades.forEach((g) => {
      const semId = g.semesterId;
      const points = g.grade;
      // Handle optional subject relation if data integrity is poor, though include ensures it.
      const credits = g.subject?.credits || 0;

      if (!semPoints[semId]) semPoints[semId] = 0;
      if (!semCredits[semId]) semCredits[semId] = 0;

      if (points === 0) semFails[semId] = true;

      semPoints[semId] += points * credits;
      semCredits[semId] += credits;
    });

    for (const semId in semCredits) {
      if (semCredits[semId] > 0) {
        const gpa = parseFloat(
          (semPoints[semId] / semCredits[semId]).toFixed(2),
        );
        gpaResults[semId] = {
          gpa,
          status: semFails[semId] ? "FAILED (R)" : "PASSED",
        };
      }
    }

    // 2. Generate AI Motivational Message
    let motivation = "";
    const motivationCacheKey = `motivation:${targetStudentId}:${semester || "all"}:${year || "all"}`;
    const cachedMotivation = await redis.get(motivationCacheKey);

    if (cachedMotivation) {
      motivation = cachedMotivation;
    } else {
      let attSummary = null;
      if (attendance.length > 0) {
        const total = attendance.reduce(
          (acc, curr) => acc + curr.totalClasses,
          0,
        );
        const attended = attendance.reduce(
          (acc, curr) => acc + curr.attendedClasses,
          0,
        );
        const percent = total > 0 ? Math.round((attended / total) * 100) : 0;
        attSummary = {
          overallPercentage: percent,
          status: percent >= 75 ? "GOOD" : "POOR",
        };
      }

      // OPTIMIZATION: Don't await the AI call.
      // Return empty motivation now, but trigger background generation to populate cache for the NEXT refresh.
      // This makes the API feel instant.
      generateMotivation(gpaResults, attSummary)
        .then((mot) => redis.setex(motivationCacheKey, 43200, mot))
        .catch((err) =>
          console.error("Background motivation failed:", err.message),
        );

      motivation = "Fetching your personalized advice... (Refresh in a moment)";
    }

    const responsePayload = {
      success: true,
      grades,
      gpa: gpaResults,
      motivation,
    };

    // 3. Set Cache (Only if no filters)
    if (!isFiltered) {
      await redis.setex(cacheKey, 3600, JSON.stringify(responsePayload));
    }

    return res.json({
      ...responsePayload,
      source: isFiltered ? "db (filtered)" : "db (calculated)",
    });
  } catch (e: any) {
    console.error("getGrades error:", e);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to retrieve academic records.",
      });
  }
};

export const addGrades = async (req: AuthenticatedRequest, res: Response) => {
  const { studentId: rawStudentId, semesterId, grades } = req.body;
  const studentId = String(rawStudentId || "").toUpperCase();

  try {
    // Resolve subject semesters to ensure canonical format
    const subjectIds = grades.map((g: any) => g.subjectId);
    const resolvedSubjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
    });
    const subMap = new Map(resolvedSubjects.map((s) => [s.id, s.semester]));

    const results = await Promise.all(
      grades.map((g: any) => {
        const canonicalSemester =
          semesterId || subMap.get(g.subjectId) || "SEM-1";
        return prisma.grade.upsert({
          where: {
            studentId_subjectId_semesterId: {
              studentId,
              subjectId: g.subjectId,
              semesterId: canonicalSemester,
            },
          },
          update: { grade: g.grade, updatedAt: new Date() },
          create: {
            studentId,
            subjectId: g.subjectId,
            semesterId: canonicalSemester,
            grade: g.grade,
          },
        });
      }),
    );

    // Invalidate Cache
    await redis.del(`grades:${studentId.toUpperCase()}`);

    return res.json({ success: true, count: results.length });
  } catch (e: any) {
    if (e.code === "P2003") {
      return res
        .status(400)
        .json({
          success: false,
          message: "The provided Student or Subject details are invalid.",
        });
    }
    return res
      .status(500)
      .json({
        success: false,
        message: "An unexpected error occurred while adding grades.",
      });
  }
};

export const bulkUpdateGrades = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { updates } = req.body; // Array of { studentId, subjectId, semesterId, grade }
  const user = req.user;

  if (
    !user ||
    !["webmaster", "dean", "director"].includes(user.role as string)
  ) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  if (!Array.isArray(updates)) {
    return res
      .status(400)
      .json({ success: false, message: "updates must be an array" });
  }

  try {
    // Pre-fetch all needed subjects to avoid N+1 queries during resolution
    const subjectCodes = updates.map((u) => u.subjectId);
    const subjects = await prisma.subject.findMany({
      where: {
        OR: [{ id: { in: subjectCodes } }, { code: { in: subjectCodes } }],
      },
    });

    const subjectMap = new Map();
    subjects.forEach((s) => {
      subjectMap.set(s.id, s);
      subjectMap.set(s.code, s);
    });

    const results = await Promise.all(
      updates.map(async (u) => {
        const subject = subjectMap.get(u.subjectId);

        if (!subject) {
          throw new Error(`Subject [${u.subjectId}] not found.`);
        }

        const resolvedSubjectId = subject.id;
        const canonicalSemester = u.semesterId || subject.semester || "SEM-1";

        const pointValue = mapGradeToPoint(u.grade);
        if (pointValue < 0 || pointValue > 10) {
          throw new Error(
            `Invalid grade point ${pointValue} for ${u.studentId}`,
          );
        }

        const studentId = String(u.studentId || "").toUpperCase();
        const batch = studentId.substring(0, 3);

        // 1. Find all existing grade entries for this student and subject
        const existingGrades = await prisma.grade.findMany({
          where: {
            studentId,
            subjectId: resolvedSubjectId,
          },
        });

        // Target Record: the one that HAS the correct canonical semesterID
        const canonicalMatch = existingGrades.find(
          (g) => g.semesterId === canonicalSemester,
        );

        if (canonicalMatch) {
          // If we found a canonical record, we update it.
          // ALSO delete any "ghost" records that might exist in wrong buckets (like E2-SEM-1)
          // to keep the unique constraint and GPA summary clean.
          if (existingGrades.length > 1) {
            await prisma.grade.deleteMany({
              where: {
                studentId,
                subjectId: resolvedSubjectId,
                id: { not: canonicalMatch.id },
              },
            });
          }

          return prisma.grade.update({
            where: { id: canonicalMatch.id },
            data: { grade: pointValue, batch, updatedAt: new Date() },
          });
        } else if (existingGrades.length > 0) {
          // If no canonical record exists but "alternate" ones do (e.g. user previously manually added E2-SEM-1):
          // Pick one to "fix" into the canonical format, and delete the rest.
          const targetId = existingGrades[0].id;

          await prisma.grade.deleteMany({
            where: {
              studentId,
              subjectId: resolvedSubjectId,
              id: { not: targetId },
            },
          });

          return prisma.grade.update({
            where: { id: targetId },
            data: {
              semesterId: canonicalSemester,
              grade: pointValue,
              batch,
              updatedAt: new Date(),
            },
          });
        } else {
          // CREATE new record if none exist at all
          return prisma.grade.create({
            data: {
              studentId,
              subjectId: resolvedSubjectId,
              semesterId: canonicalSemester,
              grade: pointValue,
              batch,
            },
          });
        }
      }),
    );

    // Clear relevant caches (Safe operation)
    try {
      const uniqueStudentIds = [
        ...new Set(updates.map((u) => String(u.studentId || "").toUpperCase())),
      ];
      for (const sid of uniqueStudentIds) {
        await redis.del(`grades:${sid}`);
      }
    } catch (redisErr) {
      console.warn("Cache invalidation skipped (Redis unreachable)");
    }

    return res.json({
      success: true,
      message: `Successfully updated ${results.length} records`,
      count: results.length,
    });
  } catch (e: any) {
    if (e.code === "P2003") {
      // Foreign Key Violation
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Cannot update grades: One or more IDs provided are invalid.",
        });
    }
    // Handle custom thrown errors (like "Subject not found")
    if (e instanceof Error) {
      return res.status(400).json({ success: false, message: e.message });
    }
    return res
      .status(500)
      .json({ success: false, message: "Bulk grade update failed." });
  }
};

export const getAttendance = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false });

  const targetStudentId = (
    (req.query.studentId as string) || user.username
  ).toUpperCase();

  // Security check
  if (targetStudentId !== user.username && user.role === "student") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  try {
    const { semester, year } = req.query;
    const sem = semester as string;
    const y = year as string;

    const where: any = {
      studentId: { equals: targetStudentId, mode: "insensitive" },
    };

    let semesterIdFilter: any = undefined;
    if (sem && y) {
      semesterIdFilter = `${y.toUpperCase()}-${sem.toUpperCase()}`;
    } else if (sem) {
      semesterIdFilter = { endsWith: `-${sem.toUpperCase()}` };
    } else if (y) {
      semesterIdFilter = { startsWith: `${y.toUpperCase()}-` };
    }

    if (semesterIdFilter) {
      where.semesterId = semesterIdFilter;
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: { subject: true },
      orderBy: { semesterId: "desc" },
    });

    // Calculate summaries and percentages
    const attendanceWithInsights = attendance.map((a) => ({
      ...a,
      percentage:
        a.totalClasses > 0
          ? parseFloat(((a.attendedClasses / a.totalClasses) * 100).toFixed(2))
          : 0,
    }));

    const summary: Record<string, any> = {};
    attendance.forEach((a) => {
      if (!summary[a.semesterId]) {
        summary[a.semesterId] = { total: 0, attended: 0 };
      }
      summary[a.semesterId].total += a.totalClasses;
      summary[a.semesterId].attended += a.attendedClasses;
    });

    for (const sem in summary) {
      summary[sem].percentage =
        summary[sem].total > 0
          ? parseFloat(
              ((summary[sem].attended / summary[sem].total) * 100).toFixed(2),
            )
          : 0;
    }

    return res.json({
      success: true,
      attendance: attendanceWithInsights,
      summary,
    });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

export const addAttendance = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { subjectId, records } = req.body;

  if (!Array.isArray(records)) {
    return res
      .status(400)
      .json({ success: false, message: "records must be an array" });
  }

  try {
    // Validation
    for (const r of records) {
      if (r.attended < 0 || r.total < 0) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Attendance values cannot be negative",
          });
      }
      if (r.attended > r.total) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Attended classes cannot exceed total classes",
          });
      }
    }

    const results = await Promise.all(
      records.map((r: any) =>
        prisma.attendance.upsert({
          where: {
            studentId_subjectId_semesterId: {
              studentId: r.studentId,
              subjectId,
              semesterId: r.semesterId || "CURRENT",
            },
          },
          update: { attendedClasses: r.attended, totalClasses: r.total },
          create: {
            studentId: r.studentId,
            subjectId,
            semesterId: r.semesterId || "CURRENT",
            attendedClasses: r.attended,
            totalClasses: r.total,
          },
        }),
      ),
    );
    return res.json({ success: true, count: results.length });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

export const publishResults = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const user = req.user;
  if (
    !user ||
    !["webmaster", "director", "dean"].includes(user.role as string)
  ) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  const { semesterId, year } = req.body;
  if (!semesterId)
    return res
      .status(400)
      .json({ success: false, message: "Semester ID required" });

  const authHeader = req.headers.authorization as string;

  // Background process
  const processPublishing = async () => {
    try {
      const where: any = { semesterId };
      if (year) {
        where.subject = {
          code: { contains: `-${year}-` },
        };
      }

      // 1. Fetch ALL grades for the target slice
      console.log(
        `[Publish] Fetching grades for ${semesterId}, Year: ${year || "All"}...`,
      );
      const grades = await prisma.grade.findMany({
        where,
        include: { subject: true },
      });

      if (grades.length === 0) {
        await redis.setex(
          `publish:progress:${user.username}`,
          3600,
          JSON.stringify({
            status: "done",
            total: 0,
            sent: 0,
            percent: 100,
            message: "No records found for the specified filters.",
          }),
        );
        return;
      }

      // 2. Fetch Student Profiles in Bulk (Optimization)
      console.log(
        `[Publish] Fetching student profiles in bulk for ${year || "All"}...`,
      );
      let profilesMap: Record<string, any> = {};
      try {
        const searchBody: any = { limit: 10000 };
        if (year) searchBody.year = year;

        const searchRes = await axios.post(
          `${GATEWAY_URL}/profile/student/search`,
          searchBody,
          {
            headers: { Authorization: authHeader },
          },
        );

        if (searchRes.data && searchRes.data.success) {
          searchRes.data.students.forEach((s: any) => {
            profilesMap[s.username] = s;
          });
        }
      } catch (err: any) {
        console.warn(
          `[Publish] Bulk profile fetch failed, falling back to defaults: ${err.message}`,
        );
      }

      // 3. Group by Student
      const studentGrades: Record<string, typeof grades> = {};
      grades.forEach((g) => {
        if (!studentGrades[g.studentId]) studentGrades[g.studentId] = [];
        studentGrades[g.studentId].push(g);
      });

      const students = Object.keys(studentGrades);
      const total = students.length;
      console.log(`[Publish] Starting email dispatch for ${total} students...`);

      // Initialize Progress
      await redis.setex(
        `publish:progress:${user.username}`,
        3600,
        JSON.stringify({
          status: "processing",
          total,
          sent: 0,
          percent: 0,
          semesterId,
        }),
      );

      // 4. Send Emails via Microservice
      let sentCount = 0;
      const chunkSize = 10; // Optimized chunk size

      for (let i = 0; i < total; i += chunkSize) {
        const batch = students.slice(i, i + chunkSize);
        await Promise.all(
          batch.map(async (studentId) => {
            const email = `${studentId.toLowerCase()}@rguktong.ac.in`;
            const profile = profilesMap[studentId];

            const name = profile?.name || "Student";
            const branch = profile?.branch || "General";
            const campus = "Ongole";

            try {
              const mailRes = await axios.post(
                `${GATEWAY_URL}/mail/send`,
                {
                  type: "results",
                  to: email,
                  data: {
                    username: studentId,
                    name,
                    branch,
                    campus,
                    semesterId,
                    grades: studentGrades[studentId],
                  },
                },
                {
                  headers: {
                    "x-internal-secret":
                      process.env.INTERNAL_SECRET || "uniz-core",
                  },
                },
              );

              if (mailRes.data && mailRes.data.success) {
                sentCount++;
              }
            } catch (e: any) {
              console.error(
                `[Publish] Failed email for ${studentId}: ${e.message}`,
              );
            }
          }),
        );

        // Update Progress in Redis
        const currentProcessed = Math.min(i + chunkSize, total);
        await redis.setex(
          `publish:progress:${user.username}`,
          3600,
          JSON.stringify({
            status: currentProcessed >= total ? "done" : "processing",
            total,
            sent: sentCount,
            percent: Math.round((currentProcessed / total) * 100),
            semesterId,
          }),
        );
      }
      console.log(`[Publish] Completed. Sent: ${sentCount}/${total}`);
    } catch (err: any) {
      console.error("[Publish] Fatal Error:", err);
      await redis.setex(
        `publish:progress:${user.username}`,
        300,
        JSON.stringify({
          status: "failed",
          message: err.message,
        }),
      );
    }
  };

  processPublishing();

  return res.json({
    success: true,
    message: "Result publishing started in background.",
    target: { semesterId, year: year || "All" },
  });
};

export const publishAttendance = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { semesterId, year, branch } = req.body;
  const user = req.user;
  const authHeader = req.headers.authorization;

  if (!semesterId || !user) {
    return res
      .status(400)
      .json({ success: false, message: "Missing semesterId" });
  }

  const processPublishing = async () => {
    try {
      // 1. Fetch data
      const attendance = await prisma.attendance.findMany({
        where: {
          semesterId,
          batch: year || undefined,
          subject: branch ? { department: branch } : undefined,
        },
        include: { subject: true },
      });

      if (attendance.length === 0) return;

      // 2. Fetch Profiles for metadata
      const studentIds = [...new Set(attendance.map((a) => a.studentId))];
      const profilesMap: Record<string, any> = {};

      try {
        const searchRes = await axios.post(
          `${GATEWAY_URL}/profile/student/search`,
          {
            userIds: studentIds,
            limit: 1000,
          },
          {
            headers: { Authorization: authHeader },
          },
        );

        if (searchRes.data && searchRes.data.success) {
          searchRes.data.students.forEach((s: any) => {
            profilesMap[s.username] = s;
          });
        }
      } catch (err: any) {
        console.warn(`[Publish-Att] Bulk profile fetch failed: ${err.message}`);
      }

      // 3. Group by Student
      const studentAttendance: Record<string, typeof attendance> = {};
      attendance.forEach((a) => {
        if (!studentAttendance[a.studentId])
          studentAttendance[a.studentId] = [];
        studentAttendance[a.studentId].push(a);
      });

      const students = Object.keys(studentAttendance);
      const total = students.length;

      // Initialize Progress
      await redis.setex(
        `publish:progress:${user.username}`,
        3600,
        JSON.stringify({
          status: "processing",
          type: "attendance",
          total,
          sent: 0,
          percent: 0,
          semesterId,
        }),
      );

      // 4. Send Emails
      let sentCount = 0;
      const chunkSize = 10;

      for (let i = 0; i < total; i += chunkSize) {
        const batch = students.slice(i, i + chunkSize);
        await Promise.all(
          batch.map(async (studentId) => {
            const email = `${studentId.toLowerCase()}@rguktong.ac.in`;
            const profile = profilesMap[studentId];

            try {
              const mailRes = await axios.post(
                `${GATEWAY_URL}/mail/send`,
                {
                  type: "attendance_report",
                  to: email,
                  data: {
                    username: studentId,
                    name: profile?.name || "Student",
                    branch: profile?.branch || "General",
                    semesterId,
                    records: studentAttendance[studentId],
                  },
                },
                {
                  headers: {
                    "x-internal-secret":
                      process.env.INTERNAL_SECRET || "uniz-core",
                  },
                },
              );

              if (mailRes.data && mailRes.data.success) sentCount++;
            } catch (e: any) {}
          }),
        );

        const currentProcessed = Math.min(i + chunkSize, total);
        await redis.setex(
          `publish:progress:${user.username}`,
          3600,
          JSON.stringify({
            status: currentProcessed >= total ? "done" : "processing",
            type: "attendance",
            total,
            sent: sentCount,
            percent: Math.round((currentProcessed / total) * 100),
            semesterId,
          }),
        );
      }
    } catch (err: any) {
      console.error("[Publish-Att] Fatal Error:", err);
    }
  };

  processPublishing();

  return res.json({
    success: true,
    message: "Attendance result publishing started.",
    target: { semesterId, year: year || "All" },
  });
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
  const user = req.user;

  // Only Webmaster or Dean/Director can add/update subjects
  const allowed = ["webmaster", "dean", "director"];
  if (!user || !allowed.includes(user.role as string)) {
    return res
      .status(403)
      .json({
        success: false,
        message: "Only administrators can manage subjects",
      });
  }

  if (!code || !name || !credits || !department || !semester) {
    return res
      .status(400)
      .json({
        success: false,
        message:
          "All fields (code, name, credits, department, semester) are required",
      });
  }

  try {
    const subject = await prisma.subject.upsert({
      where: { code },
      update: { name, credits: Number(credits), department, semester },
      create: { code, name, credits: Number(credits), department, semester },
    });
    return res.json({ success: true, subject });
  } catch (e: any) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Unable to add or update the subject at this moment.",
      });
  }
};

// --- EXCEL TEMPLATES & BULK IMPORTS ---

const generateExcel = (
  headers: string[][],
  filename: string,
  res: Response,
) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(headers);
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename=${filename}.xlsx`);
  return res.send(buf);
};

export const getGradesTemplate = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { branch, year, semesterId, subjectCode, remedialsOnly } = req.query;
  const token = req.headers.authorization;

  try {
    let students: any[] = [];
    const headers = [
      [
        "Student ID",
        "Student Name",
        "Subject Code",
        "Subject Name",
        "Semester ID",
        "Grade (EX, A, B, C, D, E, R)",
      ],
    ];

    if (remedialsOnly === "true" && subjectCode) {
      const subject = await prisma.subject.findUnique({
        where: { code: subjectCode as string },
      });
      if (!subject)
        return res.status(404).json({ message: "Subject not found" });

      const failures = await prisma.grade.findMany({
        where: {
          subjectId: subject.id,
          grade: 0,
          semesterId: semesterId as string,
        },
      });
      students = failures.map((f) => ({
        username: f.studentId,
        name: "REMEDIAL STUDENT",
      }));
    } else {
      const profilesRes = await axios.post(
        `${GATEWAY_URL}/profile/student/search`,
        {
          branch,
          year,
          limit: 10000, // High limit for all students
        },
        getHeaders(token!),
      );
      students = profilesRes.data.students || [];
    }

    // Fetch matching subjects if not specific
    const subjects = await prisma.subject.findMany({
      where: {
        department: (branch as string) || undefined,
        semester: (semesterId as string) || undefined,
        code: { startsWith: (year as string) || undefined },
      },
    });

    const activeSubjects = subjectCode
      ? subjects.filter((s) => s.code === subjectCode)
      : subjects;

    students.forEach((s: any) => {
      activeSubjects.forEach((sub) => {
        headers.push([
          s.username,
          s.name,
          sub.code,
          sub.name,
          (semesterId as string) || sub.semester,
          "",
        ]);
      });
    });

    return generateExcel(headers, `Grades_Template_${year}_${branch}`, res);
  } catch (e: any) {
    return res
      .status(500)
      .json({
        message:
          "An internal error occurred while generating the template. Please try again.",
      });
  }
};

export const uploadGrades = async (req: any, res: Response) => {
  const user = req.user;
  if (!req.file)
    return res.status(400).json({ message: "Excel file required" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let failCount = 0;
    const errors: any[] = [];
    const total = rows.length;
    const debug_v = "1.0.6 - Prod Resilient";
    const startTime = Date.now();
    // Initialize Redis Progress
    await redis.setex(
      `upload:progress:${user.username}`,
      600,
      JSON.stringify({
        status: "processing",
        type: "grades",
        processed: 0,
        total,
        success: 0,
        fail: 0,
        percent: 0,
        etaSeconds: 0,
        debug_v,
      }),
    );

    // Fire and Forget: Background Task
    const runIngestion = async () => {
      let successCount = 0;
      let failCount = 0;
      const errors: any[] = [];
      try {
        // Optimization 1: Fetch all subjects once
        const allSubjects = await prisma.subject.findMany();
        const subjectMap = new Map(allSubjects.map((s) => [s.code, s]));

        const CHUNK_SIZE = 5; // Reduced from 50 to match DB pool limit (5)
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);

          await Promise.all(
            chunk.map(async (row, indexInChunk) => {
              const globalIndex = i + indexInChunk;
              const getVal = (keys: string[]) => {
                const found = Object.keys(row).find((k) =>
                  keys.includes(k.trim().toLowerCase()),
                );
                return found ? String(row[found]).trim() : "";
              };

              const studentId = getVal([
                "student id",
                "studentid",
                "id",
              ]).toUpperCase();
              const code = getVal([
                "subject code",
                "subjectcode",
                "code",
              ]).toUpperCase();
              const semesterId = getVal([
                "semester id",
                "semesterid",
                "semester",
              ]);
              const rawGrade = getVal([
                "grade",
                "grade (ex, a, b, c, d, e, r)",
                "grade (0-10)",
              ]);

              try {
                if (!studentId || !code) throw new Error(`Missing fields`);

                const grade = mapGradeToPoint(rawGrade);
                const subject = subjectMap.get(code);
                if (!subject) throw new Error(`Subject [${code}] not found`);

                const targetSemester =
                  semesterId || subject.semester || "SEM-1";
                const batch = studentId.substring(0, 3);

                await prisma.grade.upsert({
                  where: {
                    studentId_subjectId_semesterId: {
                      studentId,
                      subjectId: subject.id,
                      semesterId: targetSemester,
                    },
                  },
                  update: { grade, batch, updatedAt: new Date() },
                  create: {
                    studentId,
                    subjectId: subject.id,
                    semesterId: targetSemester,
                    grade,
                    batch,
                  },
                });
                successCount++;
              } catch (err: any) {
                failCount++;
                errors.push({
                  row: globalIndex + 2,
                  studentId,
                  error: err.message,
                });
              }
            }),
          );

          const processedCount = Math.min(i + CHUNK_SIZE, total);
          const elapsed = Math.max(Date.now() - startTime, 1);
          const avgTimePerItem = elapsed / processedCount;
          const remaining = total - processedCount;
          const etaSeconds = Math.ceil((avgTimePerItem * remaining) / 1000);
          const displayEta =
            processedCount >= total ? 0 : Math.max(etaSeconds, 1);

          await redis.setex(
            `upload:progress:${user.username}`,
            600,
            JSON.stringify({
              status: processedCount >= total ? "done" : "processing",
              processed: processedCount,
              total,
              success: successCount,
              fail: failCount,
              percent: Math.round((processedCount / total) * 100),
              etaSeconds: displayEta,
              debug_v,
              errors: errors.slice(0, 20),
            }),
          );
        }
        console.log(
          `[Academics] Background Grades Upload Completed. Success: ${successCount}, Fail: ${failCount}`,
        );
      } catch (err) {
        console.error(
          "[Academics] Fatal Background Grades Ingestion Error:",
          err,
        );
      }
    };

    // Start background execution
    runIngestion();

    return res.status(202).json({
      success: true,
      message: "Bulk grades ingestion started in background.",
      total,
      monitor_url: "/academics/upload/progress",
    });
  } catch (e: any) {
    console.error("Upload error:", e);
    return res
      .status(500)
      .json({ message: "Failed to process the uploaded file." });
  }
};

export const getAttendanceTemplate = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const { branch, year, semesterId } = req.query;
  const token = req.headers.authorization;

  try {
    const profilesRes = await axios.post(
      `${GATEWAY_URL}/profile/student/search`,
      {
        branch,
        year,
        limit: 10000,
      },
      getHeaders(token!),
    );

    const students = profilesRes.data.students || [];
    const headers = [
      [
        "Student ID",
        "Student Name",
        "Subject Code",
        "Subject Name",
        "Semester ID",
        "Total Classes Occurred",
        "Total Classes Attended",
      ],
    ];

    // Fetch matching subjects
    const subjects = await prisma.subject.findMany({
      where: {
        department: (branch as string) || undefined,
        semester: (semesterId as string) || undefined,
        code: { startsWith: (year as string) || undefined },
      },
    });

    students.forEach((s: any) => {
      subjects.forEach((sub) => {
        headers.push([
          s.username,
          s.name,
          sub.code,
          sub.name,
          (semesterId as string) || sub.semester,
          "",
          "",
        ]);
      });
    });

    return generateExcel(headers, `Attendance_Template_${year}_${branch}`, res);
  } catch (e: any) {
    return res
      .status(500)
      .json({ message: "Unable to generate the attendance template." });
  }
};

export const uploadAttendance = async (req: any, res: Response) => {
  const user = req.user;
  if (!req.file)
    return res.status(400).json({ message: "Excel file required" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let failCount = 0;
    const errors: any[] = [];
    const totalRows = rows.length;

    // Initialize Progress
    await redis.setex(
      `upload:progress:${user.username}`,
      300,
      JSON.stringify({
        status: "processing",
        type: "attendance",
        processed: 0,
        total: totalRows,
        success: 0,
        fail: 0,
        percent: 0,
        etaSeconds: 0,
      }),
    );

    const startTime = Date.now();

    // Fire and Forget: Background Task
    const runAttendanceIngestion = async () => {
      let successCount = 0;
      let failCount = 0;
      const errors: any[] = [];
      try {
        // Optimization 1: Fetch all subjects once
        const allSubjects = await prisma.subject.findMany();
        const subjectMap = new Map(allSubjects.map((s) => [s.code, s]));

        const CHUNK_SIZE = 5; // Reduced from 50 to match DB pool limit
        for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);

          await Promise.all(
            chunk.map(async (row, indexInChunk) => {
              const globalIndex = i + indexInChunk;
              const getVal = (keys: string[]) => {
                const found = Object.keys(row).find((k) =>
                  keys.includes(k.trim().toLowerCase()),
                );
                return found ? String(row[found]).trim() : "";
              };

              const studentId = getVal([
                "student id",
                "studentid",
                "id",
              ]).toUpperCase();
              const code = getVal([
                "subject code",
                "subjectcode",
                "code",
              ]).toUpperCase();
              const semesterId = getVal([
                "semester id",
                "semesterid",
                "semester",
              ]);
              const attended =
                parseInt(
                  getVal([
                    "total classes attended",
                    "attended classes",
                    "attended",
                  ]),
                ) || 0;
              const total =
                parseInt(
                  getVal(["total classes occurred", "total classes", "total"]),
                ) || 0;

              try {
                if (!studentId || !code)
                  throw new Error("Missing Student ID or Subject Code");

                const subject = subjectMap.get(code);
                if (!subject) throw new Error(`Subject not found: ${code}`);

                const batch = studentId.substring(0, 3);

                await prisma.attendance.upsert({
                  where: {
                    studentId_subjectId_semesterId: {
                      studentId,
                      subjectId: subject.id,
                      semesterId: semesterId || "SEM-1",
                    },
                  },
                  update: {
                    attendedClasses: attended,
                    totalClasses: total,
                    batch,
                    updatedAt: new Date(),
                  },
                  create: {
                    studentId,
                    subjectId: subject.id,
                    semesterId: semesterId || "SEM-1",
                    attendedClasses: attended,
                    totalClasses: total,
                    batch,
                  },
                });
                successCount++;
              } catch (err: any) {
                failCount++;
                errors.push({
                  row: globalIndex + 2,
                  studentId,
                  error: err.message,
                });
              }
            }),
          );

          // Small delay to allow connection pool to recover
          await new Promise((resolve) => setTimeout(resolve, 50));

          const currentProcessed = Math.min(i + CHUNK_SIZE, totalRows);
          const elapsed = Math.max(Date.now() - startTime, 1);
          const avgTimePerItem = elapsed / currentProcessed;
          const remaining = totalRows - currentProcessed;
          const etaSeconds = Math.ceil((avgTimePerItem * remaining) / 1000);
          const displayEta =
            currentProcessed >= totalRows ? 0 : Math.max(etaSeconds, 1);

          await redis.setex(
            `upload:progress:${user.username}`,
            600,
            JSON.stringify({
              status: currentProcessed >= totalRows ? "done" : "processing",
              type: "attendance",
              processed: currentProcessed,
              total: totalRows,
              success: successCount,
              fail: failCount,
              percent: Math.round((currentProcessed / totalRows) * 100),
              etaSeconds: displayEta,
              errors: errors.slice(0, 20),
            }),
          );
        }
        console.log(
          `[Academics] Background Attendance Upload Completed. Success: ${successCount}, Fail: ${failCount}`,
        );
      } catch (err) {
        console.error(
          "[Academics] Fatal Background Attendance Ingestion Error:",
          err,
        );
      }
    };

    runAttendanceIngestion();

    return res.status(202).json({
      success: true,
      message: "Bulk attendance ingestion started in background.",
      total: totalRows,
      monitor_url: "/academics/upload/progress",
    });
  } catch (e: any) {
    console.error("Critical attendance upload error:", e);
    return res.status(500).json({ error: e.message });
  }
};
