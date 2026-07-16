import { Request, Response, NextFunction } from 'express'
import { sendError } from '../utils/response'

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Unhandled error:', err)

  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any

    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0] ?? 'field'
      sendError(res, `${field} already exists`, 409)
      return
    }

    if (prismaError.code === 'P2025') {
      sendError(res, 'Record not found', 404)
      return
    }
  }

  sendError(
    res,
    process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
    500
  )
}
