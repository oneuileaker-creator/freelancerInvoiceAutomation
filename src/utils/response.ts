import { Response } from 'express'

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message: message ?? null,
  })
}

export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: Record<string, string>
) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors: errors ?? null,
  })
}

export const sendValidationError = (
  res: Response,
  errors: Record<string, string>
) => {
  return res.status(422).json({
    success: false,
    data: null,
    message: 'Validation failed',
    errors,
  })
}
