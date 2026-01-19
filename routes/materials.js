const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/materials
// @desc    Get all material orders with filters
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, vendorId, status, paymentStatus } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    
    const materials = await prisma.material.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true, phone: true } },
        payments: true
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
    const { 
      item, description, materialType, supplier, quantity, unit, unitPrice,
      expectedDelivery, paymentDueDate, reminderDays, projectId, vendorId, notes 
    } = req.body;
    
    const qty = parseInt(quantity);
    const price = parseFloat(unitPrice) || 0;
    const totalCost = qty * price;

    const material = await prisma.material.create({
      data: {
        item, description, materialType, supplier,
        quantity: qty,
        unit: unit || 'PIECES',
        unitPrice: price,
        totalCost,
        remainingAmount: totalCost,
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
        reminderDays: reminderDays || 3,
        projectId, vendorId, notes
      },
      include: { vendor: true }
    });
    
    // Update vendor stats
    if (vendorId) {
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          totalOrders: { increment: 1 },
          totalAmount: { increment: totalCost },
          pendingAmount: { increment: totalCost }
        }
      });
    }

    res.status(201).json({ success: true, data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/materials/:id/deliver
// @desc    Mark material as delivered
// @access  Private/Admin
router.put('/:id/deliver', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { receivedQuantity, qualityNotes, qualityCheck } = req.body;
    
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: {
        status: 'DELIVERED',
        deliveredDate: new Date(),
        receivedQuantity: receivedQuantity ? parseInt(receivedQuantity) : undefined,
        qualityCheck: qualityCheck || false,
        qualityNotes
      }
    });
    
    res.json({ success: true, message: 'Material marked as delivered', data: material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/materials/:id/payment
// @desc    Record a payment for material
// @access  Private/Admin
router.post('/:id/payment', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { amount, paymentMode, reference, notes, receiptUrl } = req.body;
    
    const material = await prisma.material.findUnique({
      where: { id: req.params.id }
    });
    
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }
    
    const paymentAmount = parseFloat(amount);
    const newPaidAmount = material.paidAmount + paymentAmount;
    const newRemainingAmount = material.totalCost - newPaidAmount;
    const isFullyPaid = newRemainingAmount <= 0;
    
    // Create payment record
    await prisma.materialPayment.create({
      data: {
        materialId: req.params.id,
        vendorId: material.vendorId,
        amount: paymentAmount,
        paymentMode,
        reference,
        notes,
        receiptUrl
      }
    });
    
    // Update material
    const updatedMaterial = await prisma.material.update({
      where: { id: req.params.id },
      data: {
        paidAmount: newPaidAmount,
        remainingAmount: Math.max(0, newRemainingAmount),
        paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL'
      },
      include: { payments: true, vendor: true }
    });
    
    // Update vendor stats
    if (material.vendorId) {
      await prisma.vendor.update({
        where: { id: material.vendorId },
        data: {
          totalPaid: { increment: paymentAmount },
          pendingAmount: { decrement: paymentAmount }
        }
      });
    }
    
    res.json({
      success: true,
      message: isFullyPaid ? 'Payment complete' : 'Part payment recorded',
      data: updatedMaterial
    });
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
    const { quantity, unitPrice, ...rest } = req.body;
    
    let updateData = { ...rest };
    
    // Recalculate total if quantity or price changed
    if (quantity !== undefined || unitPrice !== undefined) {
      const current = await prisma.material.findUnique({ where: { id: req.params.id } });
      const newQty = quantity !== undefined ? parseInt(quantity) : current.quantity;
      const newPrice = unitPrice !== undefined ? parseFloat(unitPrice) : current.unitPrice;
      const newTotal = newQty * newPrice;
      
      updateData.quantity = newQty;
      updateData.unitPrice = newPrice;
      updateData.totalCost = newTotal;
      updateData.remainingAmount = newTotal - current.paidAmount;
    }
    
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: updateData,
      include: { vendor: true, payments: true }
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

// @route   GET /api/materials/stats
// @desc    Get material statistics
// @access  Private/Admin
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    
    const materials = await prisma.material.findMany({ where });
    
    const totalCost = materials.reduce((sum, m) => sum + m.totalCost, 0);
    const totalPaid = materials.reduce((sum, m) => sum + m.paidAmount, 0);
    const totalPending = totalCost - totalPaid;
    
    const byStatus = {
      pending: materials.filter(m => m.status === 'PENDING').length,
      ordered: materials.filter(m => m.status === 'ORDERED').length,
      shipped: materials.filter(m => m.status === 'SHIPPED').length,
      delivered: materials.filter(m => m.status === 'DELIVERED').length
    };
    
    const byPayment = {
      unpaid: materials.filter(m => m.paymentStatus === 'PENDING').length,
      partial: materials.filter(m => m.paymentStatus === 'PARTIAL').length,
      paid: materials.filter(m => m.paymentStatus === 'PAID').length
    };
    
    res.json({
      success: true,
      data: {
        totalOrders: materials.length,
        totalCost,
        totalPaid,
        totalPending,
        byStatus,
        byPayment
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/materials/reminders
// @desc    Get materials needing payment reminders
// @access  Private/Admin
router.get('/reminders', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const now = new Date();
    
    const materials = await prisma.material.findMany({
      where: {
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
        reminderEnabled: true,
        paymentDueDate: { not: null }
      },
      include: {
        project: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true, phone: true } }
      }
    });
    
    const needReminder = materials.filter(m => {
      if (!m.paymentDueDate) return false;
      const dueDate = new Date(m.paymentDueDate);
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - m.reminderDays);
      return now >= reminderDate;
    });
    
    res.json({
      success: true,
      count: needReminder.length,
      data: needReminder
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ VENDOR ROUTES ============

// @route   GET /api/materials/vendors
// @desc    Get all vendors
// @access  Private
router.get('/vendors', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { specialty, isActive } = req.query;
    
    let where = {};
    if (specialty) where.specialty = specialty;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    
    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { materials: true, payments: true } }
      }
    });
    
    res.json({ success: true, count: vendors.length, data: vendors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/materials/vendors
// @desc    Create vendor
// @access  Private/Admin
router.post('/vendors', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      name, contactPerson, phone, email, address, gstNumber, panNumber,
      bankName, bankAccount, ifscCode, specialty, location, notes 
    } = req.body;
    
    const vendor = await prisma.vendor.create({
      data: {
        name, contactPerson, phone, email, address, gstNumber, panNumber,
        bankName, bankAccount, ifscCode, 
        specialty: specialty || 'GENERAL',
        location, notes
      }
    });
    
    res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/materials/vendors/:id
// @desc    Get single vendor with order history
// @access  Private
router.get('/vendors/:id', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: {
        materials: {
          orderBy: { orderDate: 'desc' },
          take: 20,
          include: { project: { select: { id: true, name: true } } }
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 20
        }
      }
    });
    
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    
    res.json({ success: true, data: vendor });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/materials/vendors/:id
// @desc    Update vendor
// @access  Private/Admin
router.put('/vendors/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    res.json({ success: true, data: vendor });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/materials/vendors/:id
router.delete('/vendors/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.vendor.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Vendor deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

