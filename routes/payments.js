const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/payments
// @desc    Get all payment milestones
// @access  Private/Admin
router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, status } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    
    const payments = await prisma.payment.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            clientName: true,
            budget: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      count: payments.length,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/payments/project/:projectId
// @desc    Get all payments for a project
// @access  Private
router.get('/project/:projectId', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const payments = await prisma.payment.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'asc' }
    });
    
    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidAmount = payments
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = totalAmount - paidAmount;
    
    res.json({
      success: true,
      data: {
        payments,
        summary: {
          totalAmount,
          paidAmount,
          pendingAmount,
          totalMilestones: payments.length,
          paidMilestones: payments.filter(p => p.status === 'PAID').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/payments
// @desc    Create a payment milestone
// @access  Private/Admin
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, stageName, amount, dueDate, notes } = req.body;
    
    const payment = await prisma.payment.create({
      data: {
        projectId,
        stageName,
        amount,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes
      }
    });
    
    res.status(201).json({
      success: true,
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/payments/:id
// @desc    Update payment milestone
// @access  Private/Admin
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { stageName, amount, dueDate, paidDate, status, notes } = req.body;
    
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        stageName,
        amount,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        paidDate: paidDate ? new Date(paidDate) : undefined,
        status,
        notes
      }
    });
    
    // If marked as paid, update project spent amount
    if (status === 'PAID' && paidDate) {
      const projectPayments = await prisma.payment.findMany({
        where: { projectId: payment.projectId, status: 'PAID' }
      });
      const totalPaid = projectPayments.reduce((sum, p) => sum + p.amount, 0);
      
      await prisma.project.update({
        where: { id: payment.projectId },
        data: { spent: totalPaid }
      });
    }
    
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/payments/:id
// @desc    Delete payment milestone
// @access  Private/Admin
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    await prisma.payment.delete({
      where: { id: req.params.id }
    });
    
    res.json({
      success: true,
      message: 'Payment milestone deleted'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/payments/project/:projectId/setup
// @desc    Setup default payment milestones for a project
// @access  Private/Admin
router.post('/project/:projectId/setup', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId } = req.params;
    const { milestones } = req.body;
    
    // Default milestones if not provided
    const defaultMilestones = milestones || [
      { stageName: 'Advance Payment', percentage: 20 },
      { stageName: 'Foundation Complete', percentage: 25 },
      { stageName: 'Structure Complete', percentage: 30 },
      { stageName: 'Finishing Complete', percentage: 15 },
      { stageName: 'Final Handover', percentage: 10 }
    ];
    
    // Get project budget
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { budget: true }
    });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    
    // Create payment milestones
    const payments = await Promise.all(
      defaultMilestones.map(m => 
        prisma.payment.create({
          data: {
            projectId,
            stageName: m.stageName,
            amount: (project.budget * m.percentage) / 100
          }
        })
      )
    );
    
    res.status(201).json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/payments/stats
// @desc    Get payment statistics
// @access  Private/Admin
router.get('/stats/overview', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const payments = await prisma.payment.findMany();
    
    const totalExpected = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalReceived = payments
      .filter(p => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalPending = payments
      .filter(p => p.status === 'PENDING')
      .reduce((sum, p) => sum + p.amount, 0);
    const overduePayments = payments.filter(p => 
      p.status === 'PENDING' && p.dueDate && new Date(p.dueDate) < new Date()
    );
    
    res.json({
      success: true,
      data: {
        totalExpected,
        totalReceived,
        totalPending,
        overdueCount: overduePayments.length,
        overdueAmount: overduePayments.reduce((sum, p) => sum + p.amount, 0)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
