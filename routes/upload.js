const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'dsquare-crm',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
    resource_type: 'auto'
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// @route   POST /api/upload/single
router.post('/single', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({
      success: true,
      data: { url: req.file.path, publicId: req.file.filename, originalName: req.file.originalname }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/upload/project/:id/document
router.post('/project/:id/document', protect, isAdmin, upload.single('file'), async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const ext = req.file.originalname.split('.').pop().toUpperCase();
    let fileType = 'DOC';
    if (['PDF'].includes(ext)) fileType = 'PDF';
    else if (['DWG'].includes(ext)) fileType = 'DWG';
    else if (['JPG', 'JPEG', 'PNG', 'GIF'].includes(ext)) fileType = 'IMG';
    else if (['XLS', 'XLSX'].includes(ext)) fileType = 'XLS';

    const document = await prisma.document.create({
      data: {
        name: req.body.name || req.file.originalname,
        type: fileType,
        url: req.file.path,
        publicId: req.file.filename,
        size: `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`,
        projectId: req.params.id
      }
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/upload/project/:id/gallery
router.post('/project/:id/gallery', protect, isAdmin, upload.single('file'), async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { gallery: { push: req.file.path } }
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/upload/:publicId
router.delete('/:publicId', protect, isAdmin, async (req, res) => {
  try {
    const result = await cloudinary.uploader.destroy(req.params.publicId);
    if (result.result !== 'ok') {
      return res.status(400).json({ success: false, message: 'Failed to delete file' });
    }
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
