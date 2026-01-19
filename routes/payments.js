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
        },
        partPayments: true
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
// @desc    Get all payments for a project with summary
// @access  Private
router.get('/project/:projectId', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const payments = await prisma.payment.findMany({
      where: { projectId: req.params.projectId },
      include: { partPayments: true },
      orderBy: { createdAt: 'asc' }
    });
    
    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidAmount = payments.reduce((sum, p) => sum + p.paidAmount, 0);
    const pendingAmount = totalAmount - paidAmount;
    
    // Find next payment
    const nextPayment = payments.find(p => 
      p.status === 'PENDING' || p.status === 'AWAITING_CLIENT' || p.status === 'PARTIAL'
    );
    
    res.json({
      success: true,
      data: {
        payments,
        summary: {
          totalValue: totalAmount,
          paidTillDate: paidAmount,
          remainingPayment: pendingAmount,
          nextPayment: nextPayment ? {
            id: nextPayment.id,
            stageName: nextPayment.stageName,
            amount: nextPayment.amount - nextPayment.paidAmount,
            dueDate: nextPayment.dueDate,
            status: nextPayment.status
          } : null,
          totalMilestones: payments.length,
          paidMilestones: payments.filter(p => p.status === 'PAID').length,
          awaitingAcknowledgment: payments.filter(p => 
            p.status === 'AWAITING_CLIENT' || p.status === 'AWAITING_ADMIN'
          ).length
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
    const { projectId, stageName, amount, dueDate, notes, reminderDays } = req.body;
    
    const payment = await prisma.payment.create({
      data: {
        projectId,
        stageName,
        amount,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        reminderDays: reminderDays || 3
      }
    });
    
    // Create notification for client
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, name: true }
    });
    
    if (project?.clientId) {
      await prisma.notification.create({
        data: {
          userId: project.clientId,
          projectId,
          title: 'New Payment Milestone',
          message: `Payment milestone "${stageName}" of ₹${amount.toLocaleString()} has been added to ${project.name}`,
          type: 'PAYMENT_REMINDER'
        }
      });
    }
    
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

// @route   POST /api/payments/:id/request-acknowledgment
// @desc    Admin requests client acknowledgment for payment
// @access  Private/Admin
router.post('/:id/request-acknowledgment', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        status: 'AWAITING_CLIENT',
        adminAcknowledged: true,
        adminAcknowledgedAt: new Date(),
        adminAcknowledgedBy: req.user.id
      },
      include: { project: { select: { clientId: true, name: true } } }
    });
    
    // Notify client
    if (payment.project?.clientId) {
      await prisma.notification.create({
        data: {
          userId: payment.project.clientId,
          projectId: payment.projectId,
          title: 'Payment Acknowledgment Required',
          message: `Please acknowledge payment milestone "${payment.stageName}" for ₹${payment.amount.toLocaleString()}`,
          type: 'PAYMENT_REMINDER'
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Acknowledgment requested from client',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/payments/:id/client-acknowledge
// @desc    Client acknowledges payment (accepts/confirms)
// @access  Private
router.post('/:id/client-acknowledge', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { notes, accepted } = req.body;
    
    if (!accepted) {
      // Client rejected - notify admin
      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: { project: { select: { createdById: true, name: true } } }
      });
      
      if (payment?.project?.createdById) {
        await prisma.notification.create({
          data: {
            userId: payment.project.createdById,
            projectId: payment.projectId,
            title: 'Payment Acknowledgment Rejected',
            message: `Client rejected acknowledgment for "${payment.stageName}". Notes: ${notes || 'No notes provided'}`,
            type: 'ALERT'
          }
        });
      }
      
      return res.json({
        success: true,
        message: 'Rejection noted and admin notified'
      });
    }
    
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        clientAcknowledged: true,
        clientAcknowledgedAt: new Date(),
        clientNotes: notes,
        status: 'AWAITING_ADMIN' // Now waiting for admin to confirm payment received
      },
      include: { project: { select: { createdById: true, name: true } } }
    });
    
    // Notify admin
    if (payment.project?.createdById) {
      await prisma.notification.create({
        data: {
          userId: payment.project.createdById,
          projectId: payment.projectId,
          title: 'Client Acknowledged Payment',
          message: `Client acknowledged "${payment.stageName}". Please confirm payment receipt.`,
          type: 'SUCCESS'
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Acknowledgment recorded',
      data: payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/payments/:id/confirm-payment
// @desc    Admin confirms payment has been received
// @access  Private/Admin
router.post('/:id/confirm-payment', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { amount, isPartPayment, notes, receiptUrl } = req.body;
    
    const existingPayment = await prisma.payment.findUnique({
      where: { id: req.params.id }
    });
    
    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    // Check if both sides acknowledged
    if (!existingPayment.adminAcknowledged || !existingPayment.clientAcknowledged) {
      return res.status(400).json({
        success: false,
        message: 'Both admin and client must acknowledge before confirming payment'
      });
    }
    
    const paymentAmount = amount || existingPayment.amount;
    const newPaidAmount = existingPayment.paidAmount + paymentAmount;
    const isFullyPaid = newPaidAmount >= existingPayment.amount;
    
    // Create part payment record if applicable
    if (isPartPayment || !isFullyPaid) {
      await prisma.partPayment.create({
        data: {
          paymentId: req.params.id,
          amount: paymentAmount,
          notes,
          receiptUrl,
          adminAcknowledged: true,
          clientAcknowledged: existingPayment.clientAcknowledged
        }
      });
    }
    
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        paidAmount: newPaidAmount,
        paidDate: isFullyPaid ? new Date() : null,
        status: isFullyPaid ? 'PAID' : 'PARTIAL',
        isPartPayment: !isFullyPaid
      },
      include: { 
        project: { select: { id: true, clientId: true, name: true } },
        partPayments: true 
      }
    });
    
    // Update project spent amount
    const allPayments = await prisma.payment.findMany({
      where: { projectId: payment.projectId }
    });
    const totalPaid = allPayments.reduce((sum, p) => sum + p.paidAmount, 0);
    
    await prisma.project.update({
      where: { id: payment.projectId },
      data: { spent: totalPaid }
    });
    
    // Notify client
    if (payment.project?.clientId) {
      await prisma.notification.create({
        data: {
          userId: payment.project.clientId,
          projectId: payment.projectId,
          title: isFullyPaid ? 'Payment Confirmed' : 'Part Payment Confirmed',
          message: isFullyPaid 
            ? `Payment of ₹${paymentAmount.toLocaleString()} for "${payment.stageName}" has been confirmed`
            : `Part payment of ₹${paymentAmount.toLocaleString()} received. Remaining: ₹${(payment.amount - newPaidAmount).toLocaleString()}`,
          type: 'SUCCESS'
        }
      });
    }
    
    res.json({
      success: true,
      message: isFullyPaid ? 'Payment fully confirmed' : 'Part payment confirmed',
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
    const { stageName, amount, dueDate, notes, reminderDays, reminderEnabled } = req.body;
    
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        stageName,
        amount,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        reminderDays,
        reminderEnabled
      }
    });
    
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
      select: { budget: true, clientId: true, name: true }
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
            amount: (project.budget * m.percentage) / 100,
            dueDate: m.dueDate ? new Date(m.dueDate) : null
          }
        })
      )
    );
    
    // Notify client
    if (project.clientId) {
      await prisma.notification.create({
        data: {
          userId: project.clientId,
          projectId,
          title: 'Payment Schedule Created',
          message: `Payment schedule with ${payments.length} milestones has been set up for ${project.name}`,
          type: 'INFO'
        }
      });
    }
    
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

// @route   GET /api/payments/stats/overview
// @desc    Get payment statistics
// @access  Private/Admin
router.get('/stats/overview', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const payments = await prisma.payment.findMany({
      include: { partPayments: true }
    });
    
    const totalExpected = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalReceived = payments.reduce((sum, p) => sum + p.paidAmount, 0);
    const totalPending = totalExpected - totalReceived;
    
    const now = new Date();
    const overduePayments = payments.filter(p => 
      p.status !== 'PAID' && p.dueDate && new Date(p.dueDate) < now
    );
    
    const awaitingAcknowledgment = payments.filter(p => 
      p.status === 'AWAITING_CLIENT' || p.status === 'AWAITING_ADMIN'
    );
    
    res.json({
      success: true,
      data: {
        totalExpected,
        totalReceived,
        totalPending,
        overdueCount: overduePayments.length,
        overdueAmount: overduePayments.reduce((sum, p) => sum + (p.amount - p.paidAmount), 0),
        awaitingAcknowledgmentCount: awaitingAcknowledgment.length,
        partialPaymentsCount: payments.filter(p => p.status === 'PARTIAL').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/payments/reminders
// @desc    Get payments that need reminders
// @access  Private/Admin
router.get('/reminders', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const now = new Date();
    const payments = await prisma.payment.findMany({
      where: {
        status: { in: ['PENDING', 'AWAITING_CLIENT', 'PARTIAL'] },
        reminderEnabled: true,
        dueDate: { not: null }
      },
      include: {
        project: {
          select: { id: true, name: true, clientName: true, clientId: true }
        }
      }
    });
    
    // Filter payments due within reminder days
    const needReminder = payments.filter(p => {
      if (!p.dueDate) return false;
      const dueDate = new Date(p.dueDate);
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - p.reminderDays);
      return now >= reminderDate && now <= dueDate;
    });
    
    res.json({
      success: true,
      count: needReminder.length,
      data: needReminder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

