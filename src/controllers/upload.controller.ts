import { Response } from 'express'
import path from 'path'
import sharp from 'sharp'
import fs from 'fs'
import { prisma } from '../config/database'
import { sendSuccess, sendError } from '../utils/response'
import { AuthRequest } from '../middleware/auth'

export const uploadLogo = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.file) {
      sendError(res, 'No file uploaded', 400)
      return
    }

    const inputPath = req.file.path
    const outputPath = inputPath.replace(
      path.extname(inputPath),
      '_optimized.webp',
    )

    // Resize + optimize with Sharp
    // Max 400x400, convert to WebP for smaller size
    await sharp(inputPath)
      .resize(400, 400, {
        fit: 'inside',        // maintain aspect ratio
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(outputPath)

    // Delete original
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath)
    }

    // Build the URL to serve the file
    const fileName = path.basename(outputPath)
    const logoUrl = `/uploads/logos/${fileName}`

    // Delete old logo file if exists
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { logoUrl: true },
    })

    if (user?.logoUrl) {
      const oldPath = path.join(
        process.cwd(),
        user.logoUrl.replace(/^\//, ''),
      )
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath)
      }
    }

    // Save URL to database
    await prisma.user.update({
      where: { id: req.userId! },
      data: { logoUrl },
    })

    sendSuccess(res, { logo_url: logoUrl }, 'Logo uploaded')
  } catch (error: any) {
    console.error('Logo upload error:', error)
    sendError(res, 'Failed to upload logo', 500)
  }
}

export const deleteLogo = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { logoUrl: true },
    })

    if (user?.logoUrl) {
      const filePath = path.join(
        process.cwd(),
        user.logoUrl.replace(/^\//, ''),
      )
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    await prisma.user.update({
      where: { id: req.userId! },
      data: { logoUrl: null },
    })

    sendSuccess(res, null, 'Logo removed')
  } catch (error) {
    sendError(res, 'Failed to remove logo', 500)
  }
}
