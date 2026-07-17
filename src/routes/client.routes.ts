import { Router } from 'express'
import * as clientController from '../controllers/client.controller'
import { authenticate } from '../middleware/auth'
import { generalApiRateLimit } from '../middleware/rateLimiter'

const router = Router()

router.use(authenticate)

// General rate limit on all client routes
router.use(generalApiRateLimit)

router.get('/', clientController.getClients)
router.post('/', clientController.createClient)
router.get('/:id', clientController.getClient)
router.put('/:id', clientController.updateClient)
router.delete('/:id', clientController.deleteClient)

export default router
