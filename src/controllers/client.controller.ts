import { Response } from 'express'
import { z } from 'zod'
import * as clientService from '../services/client.service'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(100),
  email: z.string().email('Invalid email').nullish().or(z.literal('')),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  gstin: z.string().length(15, 'GSTIN must be 15 characters').nullish().or(z.literal('')),
  notes: z.string().nullish(),
})

export const getClients = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const search = req.query.search as string | undefined
    const result = await clientService.getClients(req.userId!, search)
    sendSuccess(res, result)
  } catch (error) {
    sendError(res, 'Failed to fetch clients', 500)
  }
}

export const getClient = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const client = await clientService.getClient(req.params.id, req.userId!)
    sendSuccess(res, client)
  } catch (error: any) {
    if (error.message === 'CLIENT_NOT_FOUND') {
      sendError(res, 'Client not found', 404)
      return
    }
    sendError(res, 'Failed to fetch client', 500)
  }
}

export const createClient = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = clientSchema.parse(req.body)
    const client = await clientService.createClient(req.userId!, {
      name: body.name,
      email: body.email || undefined,
      phone: body.phone || undefined,
      address: body.address || undefined,
      gstin: body.gstin || undefined,
      notes: body.notes || undefined,
    })
    sendSuccess(res, client, 'Client created', 201)
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const fieldErrors: Record<string, string> = {}
      error.errors.forEach((e: any) => {
        fieldErrors[e.path.join('.')] = e.message
      })
      res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: fieldErrors })
      return
    }
    sendError(res, 'Failed to create client', 500)
  }
}

export const updateClient = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const body = clientSchema.parse(req.body)
    const client = await clientService.updateClient(
      req.params.id,
      req.userId!,
      {
        name: body.name,
        email: body.email || undefined,
        phone: body.phone || undefined,
        address: body.address || undefined,
        gstin: body.gstin || undefined,
        notes: body.notes || undefined,
      }
    )
    sendSuccess(res, client, 'Client updated')
  } catch (error: any) {
    if (error.message === 'CLIENT_NOT_FOUND') {
      sendError(res, 'Client not found', 404)
      return
    }
    sendError(res, 'Failed to update client', 500)
  }
}

export const deleteClient = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    await clientService.deleteClient(req.params.id, req.userId!)
    sendSuccess(res, null, 'Client deleted')
  } catch (error: any) {
    if (error.message === 'CLIENT_NOT_FOUND') {
      sendError(res, 'Client not found', 404)
      return
    }
    if (error.message === 'CLIENT_HAS_INVOICES') {
      sendError(res, 'Cannot delete client with existing invoices', 409)
      return
    }
    sendError(res, 'Failed to delete client', 500)
  }
}
