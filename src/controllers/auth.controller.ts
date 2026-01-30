import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { signToken } from '../utils/token.util';
import { comparePassword, hashPassword } from '../utils/password.util';
import { z } from 'zod';
import { ErrorCode } from '../shared/error-codes';
import { UserRole } from '../shared/roles.enum';

const prisma = new PrismaClient();

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.authCredential.findUnique({ where: { username } });

    if (!user || user.isDisabled) {
      return res.status(401).json({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid username or password',
      });
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid username or password',
      });
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
    });

    const response: any = { success: true, token, role: user.role, username: user.username };
    
    if (user.role === UserRole.STUDENT) {
      response.student_token = token;
    } else if (user.role !== UserRole.HOD && user.role !== UserRole.TEACHER) {
      response.admin_token = token;
    }

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Login failed' });
  }
};

export const requestOtp = async (req: Request, res: Response) => {
  const { username } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    const user = await prisma.authCredential.findUnique({ where: { username } });
    if (!user) {
        return res.status(404).json({ code: ErrorCode.RESOURCE_NOT_FOUND, message: 'User not found' });
    }

    await prisma.otpLog.create({
      data: { username, otp, expiresAt },
    });

    console.log(`[MOCK EMAIL] OTP for ${username}: ${otp}`);
    return res.json({ success: true, message: 'OTP sent' });
  } catch (error) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'OTP generation failed' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { username, otp } = req.body;
  
  try {
    const validOtp = await prisma.otpLog.findFirst({
      where: {
        username,
        otp,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!validOtp) {
      return res.status(400).json({ code: ErrorCode.VALIDATION_ERROR, message: 'Invalid or expired OTP' });
    }

    await prisma.otpLog.update({
      where: { id: validOtp.id },
      data: { consumedAt: new Date() },
    });

    return res.json({ success: true, message: 'OTP Verified' });
  } catch (error) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Verification failed' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { username, otp, newPassword } = req.body;

    try {
        const freshOtp = await prisma.otpLog.findFirst({
            where: {
                username,
                otp,
                expiresAt: { gt: new Date() },
                consumedAt: null
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!freshOtp) {
            return res.status(400).json({ code: ErrorCode.VALIDATION_ERROR, message: 'Invalid or expired OTP' });
        }

        const hashedPassword = await hashPassword(newPassword);

        await prisma.$transaction([
            prisma.otpLog.update({ where: { id: freshOtp.id }, data: { consumedAt: new Date() } }),
            prisma.authCredential.update({ where: { username }, data: { passwordHash: hashedPassword } })
        ]);

        return res.json({ success: true, message: 'Password updated' });

    } catch (e) {
        return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Reset failed' });
    }
}

export const signup = async (req: Request, res: Response) => {
  const { username, password, role, email } = req.body;

  try {
    const existing = await prisma.authCredential.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ code: ErrorCode.VALIDATION_ERROR, message: 'Username already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.authCredential.create({
      data: {
        username,
        passwordHash: hashedPassword,
        role: role || UserRole.STUDENT,
        // In a real flow, you'd emit an event here to create a profile in User Service
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(500).json({ code: ErrorCode.INTERNAL_SERVER_ERROR, message: 'Signup failed' });
  }
};
