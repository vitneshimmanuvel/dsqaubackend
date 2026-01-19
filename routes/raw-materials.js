const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ============ ENQUIRY ROUTES ============

// @route   GET /api/raw-materials/enquiries
// @desc    Get all enquiries
router.get('/enquiries', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { status, materialType } = req.query;
    
    let where = {};
    if (status) where.status = status;
    if (materialType) where.materialType = materialType;
    
    const enquiries = await prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        orders: { select: { id: true, orderNumber: true, status: true } }
      }
    });
    
    res.json({ success: true, count: enquiries.length, data: enquiries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/raw-materials/enquiries
// @desc    Create new enquiry
router.post('/enquiries', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      customerName, customerPhone, customerEmail, customerAddress,
      materialType, quantity, unit, description, deliveryAddress, deliveryDate,
      quotedPrice, priority, notes 
    } = req.body;
    
    const enquiry = await prisma.enquiry.create({
      data: {
        customerName, customerPhone, customerEmail, customerAddress,
        materialType,
        quantity: parseFloat(quantity),
        unit: unit || 'TRUCKS',
        description, deliveryAddress,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        quotedPrice: quotedPrice ? parseFloat(quotedPrice) : null,
        priority: priority || 'NORMAL',
        notes
      }
    });
    
    res.status(201).json({ success: true, data: enquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/raw-materials/enquiries/:id/quote
// @desc    Send quote for enquiry
router.put('/enquiries/:id/quote', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { quotedPrice, notes } = req.body;
    
    const enquiry = await prisma.enquiry.update({
      where: { id: req.params.id },
      data: {
        quotedPrice: parseFloat(quotedPrice),
        status: 'QUOTED',
        notes
      }
    });
    
    res.json({ success: true, message: 'Quote sent', data: enquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/raw-materials/enquiries/:id/negotiate
// @desc    Update after negotiation
router.put('/enquiries/:id/negotiate', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { finalPrice, notes } = req.body;
    
    const enquiry = await prisma.enquiry.update({
      where: { id: req.params.id },
      data: {
        finalPrice: parseFloat(finalPrice),
        isNegotiated: true,
        status: 'NEGOTIATING',
        notes
      }
    });
    
    res.json({ success: true, data: enquiry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/raw-materials/enquiries/:id/convert
// @desc    Convert enquiry to order
router.post('/enquiries/:id/convert', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { deliveryDate, vehicleNumber, driverName, driverPhone, notes } = req.body;
    
    const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
    if (!enquiry) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    
    const unitPrice = enquiry.finalPrice || enquiry.quotedPrice || 0;
    const totalAmount = unitPrice * enquiry.quantity;
    
    // Create order from enquiry
    const order = await prisma.rawMaterialOrder.create({
      data: {
        customerName: enquiry.customerName,
        customerPhone: enquiry.customerPhone,
        customerAddress: enquiry.customerAddress,
        materialType: enquiry.materialType,
        quantity: enquiry.quantity,
        unit: enquiry.unit,
        unitPrice,
        totalAmount,
        deliveryAddress: enquiry.deliveryAddress || enquiry.customerAddress || '',
        deliveryDate: deliveryDate ? new Date(deliveryDate) : enquiry.deliveryDate,
        vehicleNumber, driverName, driverPhone, notes,
        enquiryId: enquiry.id,
        status: 'CONFIRMED'
      }
    });
    
    // Update enquiry status
    await prisma.enquiry.update({
      where: { id: req.params.id },
      data: {
        status: 'CONVERTED',
        convertedToOrderId: order.id
      }
    });
    
    res.json({ success: true, message: 'Enquiry converted to order', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ ORDER ROUTES ============

// @route   GET /api/raw-materials/orders
// @desc    Get all orders
router.get('/orders', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { status, paymentStatus } = req.query;
    
    let where = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    
    const orders = await prisma.rawMaterialOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { payments: true, enquiry: { select: { id: true, enquiryNumber: true } } }
    });
    
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/raw-materials/orders
// @desc    Create order directly (without enquiry)
router.post('/orders', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      customerName, customerPhone, customerAddress,
      materialType, quantity, unit, unitPrice,
      deliveryAddress, deliveryDate, vehicleNumber, driverName, driverPhone, notes 
    } = req.body;
    
    const qty = parseFloat(quantity);
    const price = parseFloat(unitPrice);
    
    const order = await prisma.rawMaterialOrder.create({
      data: {
        customerName, customerPhone, customerAddress,
        materialType,
        quantity: qty,
        unit: unit || 'TRUCKS',
        unitPrice: price,
        totalAmount: qty * price,
        deliveryAddress: deliveryAddress || customerAddress,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        vehicleNumber, driverName, driverPhone, notes
      }
    });
    
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/raw-materials/orders/:id/dispatch
// @desc    Dispatch order
router.put('/orders/:id/dispatch', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { vehicleNumber, driverName, driverPhone } = req.body;
    
    const order = await prisma.rawMaterialOrder.update({
      where: { id: req.params.id },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
        vehicleNumber, driverName, driverPhone
      }
    });
    
    res.json({ success: true, message: 'Order dispatched', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/raw-materials/orders/:id/deliver
// @desc    Mark order as delivered
router.put('/orders/:id/deliver', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const order = await prisma.rawMaterialOrder.update({
      where: { id: req.params.id },
      data: {
        status: 'DELIVERED',
        deliveredDate: new Date()
      }
    });
    
    res.json({ success: true, message: 'Order delivered', data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/raw-materials/orders/:id/payment
// @desc    Record payment for order
router.post('/orders/:id/payment', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { amount, paymentMode, reference, notes } = req.body;
    
    const order = await prisma.rawMaterialOrder.findUnique({ where: { id: req.params.id } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const paymentAmount = parseFloat(amount);
    const newPaidAmount = order.paidAmount + paymentAmount;
    const isFullyPaid = newPaidAmount >= order.totalAmount;
    
    // Create payment record
    await prisma.rawMaterialPayment.create({
      data: {
        orderId: req.params.id,
        amount: paymentAmount,
        paymentMode, reference, notes
      }
    });
    
    // Update order
    const updatedOrder = await prisma.rawMaterialOrder.update({
      where: { id: req.params.id },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
        paymentMode
      },
      include: { payments: true }
    });
    
    res.json({
      success: true,
      message: isFullyPaid ? 'Payment complete' : 'Payment recorded',
      data: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/raw-materials/stats
// @desc    Get raw material business stats
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const enquiries = await prisma.enquiry.findMany();
    const orders = await prisma.rawMaterialOrder.findMany();
    
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const collectedRevenue = orders.reduce((sum, o) => sum + o.paidAmount, 0);
    const pendingRevenue = totalRevenue - collectedRevenue;
    
    res.json({
      success: true,
      data: {
        enquiries: {
          total: enquiries.length,
          new: enquiries.filter(e => e.status === 'NEW').length,
          quoted: enquiries.filter(e => e.status === 'QUOTED').length,
          converted: enquiries.filter(e => e.status === 'CONVERTED').length
        },
        orders: {
          total: orders.length,
          pending: orders.filter(o => o.status === 'PENDING').length,
          dispatched: orders.filter(o => o.status === 'DISPATCHED').length,
          delivered: orders.filter(o => o.status === 'DELIVERED').length
        },
        revenue: {
          total: totalRevenue,
          collected: collectedRevenue,
          pending: pendingRevenue
        },
        conversionRate: enquiries.length > 0
          ? ((enquiries.filter(e => e.status === 'CONVERTED').length / enquiries.length) * 100).toFixed(1)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
