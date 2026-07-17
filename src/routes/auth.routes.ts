import { Router } from 'express'
import * as authController from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/register', authController.register)
router.post('/login', authController.login)
router.get('/me', authenticate, authController.getMe)
router.put('/profile', authenticate, authController.updateProfile)
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password', authController.resetPassword)
router.get('/reminder-settings', authenticate, authController.getReminderSettings)
router.put('/reminder-settings', authenticate, authController.updateReminderSettings)

export default router
