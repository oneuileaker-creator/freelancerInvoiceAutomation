import { Router } from 'express'
import * as viewController from '../controllers/view.controller'

const router = Router()

// Public invoice portal view page (No auth required)
router.get('/invoice/:id', viewController.viewInvoice)

export default router
