import { Router } from 'express'
import * as authController from '../controllers/auth.controller'
import * as uploadController from '../controllers/upload.controller'
import { authenticate } from '../middleware/auth'
import { logoUpload } from '../middleware/upload'
import {
  loginRateLimit,
  registerRateLimit,
  forgotPasswordRateLimit,
  uploadRateLimit,
} from '../middleware/rateLimiter'

const router = Router()

// Public routes with rate limiting
router.post('/register', registerRateLimit, authController.register)
router.post('/login', loginRateLimit, authController.login)
router.post('/forgot-password', forgotPasswordRateLimit, authController.forgotPassword)
router.post('/reset-password', authController.resetPassword)

// Protected routes
router.get('/me', authenticate, authController.getMe)
router.put('/profile', authenticate, authController.updateProfile)
router.post('/change-password', authenticate, authController.changePassword)
router.get('/reminder-settings', authenticate, authController.getReminderSettings)
router.put('/reminder-settings', authenticate, authController.updateReminderSettings)

// Logo upload with rate limiting
router.post(
  '/logo',
  authenticate,
  uploadRateLimit,
  logoUpload.single('logo'),
  uploadController.uploadLogo,
)
router.delete('/logo', authenticate, uploadController.deleteLogo)

export default router
