import { Router } from 'express'
import * as clientController from '../controllers/client.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/', clientController.getClients)
router.post('/', clientController.createClient)
router.get('/:id', clientController.getClient)
router.put('/:id', clientController.updateClient)
router.delete('/:id', clientController.deleteClient)

export default router
