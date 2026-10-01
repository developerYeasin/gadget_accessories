import multer from 'multer';

// Files are kept in memory and streamed to Cloudflare R2 by the upload route
export default multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpe?g|png|webp|gif|avif)$/i.test(file.originalname) && /^image\//.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});
