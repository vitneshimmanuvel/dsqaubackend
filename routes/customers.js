const express = require('express');
const bcrypt = require('bcryptjs');
const { protect, isAdmin, isSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/customers
// @desc    Get all customers
// @access  Private/Admin
router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    let where = { role: 'CUSTOMER' };
    
    // If admin (not super admin), only show assigned customers
    if (req.user.role === 'ADMIN') {
      where.assignedToId = req.user.id;
    }
    
    const customers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        assignedTo: {
          select: { id: true, name: true }
        },
        clientProjects: {
          select: {
            id: true,
            name: true,
            status: true,
            progress: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer with projects
// @access  Private/Admin
router.get('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        assignedTo: {
          select: { id: true, name: true }
        },
        clientProjects: {
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            budget: true,
            spent: true,
            startDate: true,
            deadline: true,
            thumbnail: true
          }
        }
      }
    });
    
    if (!customer || customer.role === 'SUPER_ADMIN') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/customers
// @desc    Create a new customer
// @access  Private/Admin
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name, email, password, phone, address, assignedToId } = req.body;
    
    // Check if email exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create customer
    const customer = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        address,
        role: 'CUSTOMER',
        assignedToId: assignedToId || req.user.id // Assign to current admin if not specified
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        createdAt: true
      }
    });
    
    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private/Admin
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name, email, phone, address, isActive, assignedToId } = req.body;
    
    const customer = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, phone, address, isActive, assignedToId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        isActive: true,
        updatedAt: true
      }
    });
    
    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete customer
// @access  Private/SuperAdmin
router.delete('/:id', protect, isSuperAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    await prisma.user.delete({
      where: { id: req.params.id }
    });
    
    res.json({
      success: true,
      message: 'Customer deleted'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/customers/stats
// @desc    Get customer statistics
// @access  Private/Admin
router.get('/stats/overview', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const [totalCustomers, activeCustomers, totalAdmins] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', isActive: true } }),
      prisma.user.count({ where: { role: 'ADMIN' } })
    ]);
    
    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers: totalCustomers - activeCustomers,
        totalAdmins
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
