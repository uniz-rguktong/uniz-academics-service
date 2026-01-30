import { Router } from 'express';
import { login, requestOtp, resetPassword, verifyOtp, signup } from '../controllers/auth.controller';
import { rateLimiter } from '../middlewares/ratelimit.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { z } from 'zod';

const router = Router();

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const OtpRequestSchema = z.object({
  username: z.string(),
});

const OtpVerifySchema = z.object({
  username: z.string(),
  otp: z.string().length(6),
});

const PasswordResetSchema = z.object({
  username: z.string(),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
});

const SignupSchema = z.object({
  username: z.string(),
  password: z.string().min(6),
  role: z.string().default('student'),
  email: z.string().email().optional(),
});


router.post('/login', validateRequest(LoginSchema), login);
router.post('/signup', validateRequest(SignupSchema), signup);
router.post('/otp/request', rateLimiter, validateRequest(OtpRequestSchema), requestOtp);
router.post('/otp/verify', validateRequest(OtpVerifySchema), verifyOtp);
router.post('/password/reset', validateRequest(PasswordResetSchema), resetPassword);

router.post('/logout', (req, res) => {
    res.json({ success: true });
});

export default router;
