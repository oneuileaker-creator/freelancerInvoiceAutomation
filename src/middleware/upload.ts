import multer from 'multer'
import path from 'path'
import fs from 'fs'

// Store logos in uploads/logos folder
const uploadDir = path.join(process.cwd(), 'uploads', 'logos')

// Create directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // userId_timestamp.ext — unique per user
    const ext = path.extname(file.originalname).toLowerCase()
    const userId = (req as any).userId
    cb(null, `${userId}_${Date.now()}${ext}`)
  },
})

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only JPG, PNG and WebP images are allowed'))
  }
}

export const logoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5MB max
  },
})
