const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/materials
// @desc    Get all material orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const materials = await prisma.material.findMany({
      orderBy: { date: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } }
      }
    });

    res.json({
      success: true,
      count: materials.length,
      data: materials
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/materials
// @desc    Create material order
// @access  Private/Admin
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { item, supplier, quantity, unit, status, date, cost, projectId, vendorId, notes } = req.body;

    const material = await prisma.material.create({
      data: {
        item, supplier, quantity: parseInt(quantity), unit,
        status: status || 'PENDING',
        date: date ? new Date(date) : new Date(),
        cost: parseFloat(cost),
        projectId, vendorId, notes
      }
    });

    res.status(201).json({ success: true, data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/materials/:id
// @desc    Update material order
// @access  Private/Admin
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json({ success: true, data: material });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Material order not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/materials/:id
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.material.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Material order deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Material order not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/materials/:id/status
router.put('/:id/status', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { status: req.body.status }
    });
    res.json({ success: true, data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
