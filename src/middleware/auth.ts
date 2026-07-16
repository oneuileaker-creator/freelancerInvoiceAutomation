import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'
import { sendError } from '../utils/response'

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    email: string
    name: string
  }
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 'No token provided', 401)
      return
    }

    const token = authHeader.split(' ')[1]

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as { userId: string }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    })

    if (!user) {
      sendError(res, 'User not found', 401)
      return
    }

    req.userId = user.id
    req.user = user

    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      sendError(res, 'Token expired. Please login again.', 401)
    } else if (error instanceof jwt.JsonWebTokenError) {
      sendError(res, 'Invalid token', 401)
    } else {
      sendError(res, 'Authentication failed', 401)
    }
  }
}
