const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/transactions
router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      include: { project: { select: { id: true, name: true } } }
    });
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/transactions
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { description, amount, type, date, status, category, reference, projectId } = req.body;
    const transaction = await prisma.transaction.create({
      data: {
        description, amount: parseFloat(amount), type,
        date: date ? new Date(date) : new Date(),
        status: status || 'PENDING', category: category || 'OTHER',
        reference, projectId
      }
    });
    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/transactions/:id
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const transaction = await prisma.transaction.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/transactions/:id
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.transaction.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/transactions/project/:projectId
router.get('/project/:projectId', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const transactions = await prisma.transaction.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { date: 'desc' }
    });
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
