import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { JwtPayload, JwtPayloadSchema } from "../shared/jwt.schema";
import { ErrorCode } from "../shared/error-codes";

const SECRET = process.env.JWT_SECURITY_KEY;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECURITY_KEY is required in production");
}
const JWT_SECRET: string = (SECRET || "default_secret_unsafe").trim();

const I_SECRET = process.env.INTERNAL_SECRET;
if (!I_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("INTERNAL_SECRET is required in production");
}
const INTERNAL_SECRET = (I_SECRET || "uniz-core").trim();

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Check for internal secret first
  const internalSecret = req.headers["x-internal-secret"];
  if (internalSecret && internalSecret === INTERNAL_SECRET) {
    (req as AuthenticatedRequest).user = {
      id: "internal",
      username: "internal-service",
      role: "webmaster" as any,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      code: ErrorCode.AUTH_UNAUTHORIZED,
      message: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Validate shape
    const parsed = JwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(401).json({
        code: ErrorCode.AUTH_UNAUTHORIZED,
        message: "Invalid token structure",
      });
    }
    (req as AuthenticatedRequest).user = parsed.data;
    next();
  } catch (error) {
    return res.status(401).json({
      code: ErrorCode.AUTH_TOKEN_EXPIRED,
      message: "Invalid or expired token",
    });
  }
};
