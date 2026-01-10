const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Default project stages
const DEFAULT_STAGES = [
  { name: 'Site Preparation', status: 'PENDING', progress: 0 },
  { name: 'Foundation', status: 'PENDING', progress: 0 },
  { name: 'Structure/Framing', status: 'PENDING', progress: 0 },
  { name: 'Roofing', status: 'PENDING', progress: 0 },
  { name: 'Electrical & Plumbing', status: 'PENDING', progress: 0 },
  { name: 'Interior Finishing', status: 'PENDING', progress: 0 },
  { name: 'Painting', status: 'PENDING', progress: 0 },
  { name: 'Final Inspection', status: 'PENDING', progress: 0 },
  { name: 'Handover', status: 'PENDING', progress: 0 }
];

// @route   GET /api/projects
// @desc    Get all projects (Admin gets all, Customer gets their own)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    let where = {};
    
    // Customer can only see their own projects
    if (req.user.role === 'CUSTOMER') {
      where = { clientId: req.user.id };
    }
    // Admin can see projects assigned to them
    else if (req.user.role === 'ADMIN') {
      where = { assignedAdminId: req.user.id };
    }
    // Super Admin sees all

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        milestones: true,
        payments: { select: { id: true, stageName: true, amount: true, status: true } },
        _count: { select: { documents: true, invoices: true, workerLogs: true } }
      }
    });
    
    res.json({
      success: true,
      count: projects.length,
      data: projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/projects/:id
// @desc    Get single project
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        milestones: { orderBy: { date: 'asc' } },
        documents: { orderBy: { uploadedAt: 'desc' } },
        invoices: { orderBy: { date: 'desc' } },
        budgetItems: true
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access for clients
    if (req.user.role === 'CLIENT' && project.clientId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this project'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/projects
// @desc    Create new project
// @access  Private/Admin
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const {
      name, clientName, clientId, clientPhone, clientAddress,
      location, status, progress,
      startDate, deadline, budget, spent, description, notes,
      thumbnail, assignedAdminId, gallery, stages
    } = req.body;

    const project = await prisma.project.create({
      data: {
        name,
        clientName,
        clientId,
        clientPhone,
        clientAddress,
        location,
        status: status || 'PLANNING',
        progress: progress || 0,
        startDate: new Date(startDate),
        deadline: new Date(deadline),
        budget: parseFloat(budget) || 0,
        spent: parseFloat(spent) || 0,
        description,
        notes,
        thumbnail,
        assignedAdminId: assignedAdminId || req.user.id,
        createdById: req.user.id,
        gallery: gallery || [],
        stages: stages || DEFAULT_STAGES
      }
    });

    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private/Admin
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const updateData = { ...req.body };
    
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.deadline) updateData.deadline = new Date(updateData.deadline);
    if (updateData.budget) updateData.budget = parseFloat(updateData.budget);
    if (updateData.spent) updateData.spent = parseFloat(updateData.spent);

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/projects/:id
// @desc    Delete project
// @access  Private/Admin
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.project.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      message: 'Project deleted'
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/projects/:id/milestones
// @desc    Add milestone to project
// @access  Private/Admin
router.post('/:id/milestones', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { title, date, status, description } = req.body;

    const milestone = await prisma.milestone.create({
      data: {
        title,
        date: new Date(date),
        status: status || 'PENDING',
        description,
        projectId: req.params.id
      }
    });

    res.status(201).json({
      success: true,
      data: milestone
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/projects/:id/milestones/:milestoneId
// @desc    Update milestone
// @access  Private/Admin
router.put('/:id/milestones/:milestoneId', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const updateData = { ...req.body };
    if (updateData.date) updateData.date = new Date(updateData.date);

    const milestone = await prisma.milestone.update({
      where: { id: req.params.milestoneId },
      data: updateData
    });

    res.json({
      success: true,
      data: milestone
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Milestone not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/projects/:id/invoices
// @desc    Add invoice to project
// @access  Private/Admin
router.post('/:id/invoices', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { number, amount, date, status, stage } = req.body;

    const invoice = await prisma.invoice.create({
      data: {
        number,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        status: status || 'PENDING',
        stage,
        projectId: req.params.id
      }
    });

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/projects/stats/overview
// @desc    Get project statistics
// @access  Private/Admin
router.get('/stats/overview', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const [totalProjects, activeProjects, completedProjects, projects] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: { not: 'COMPLETED' } } }),
      prisma.project.count({ where: { status: 'COMPLETED' } }),
      prisma.project.findMany({ select: { budget: true, spent: true } })
    ]);
    
    const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
    const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);

    res.json({
      success: true,
      data: {
        totalProjects,
        activeProjects,
        completedProjects,
        totalBudget,
        totalSpent
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/projects/stages/default
// @desc    Get default project stages
// @access  Private
router.get('/stages/default', protect, (req, res) => {
  res.json({
    success: true,
    data: DEFAULT_STAGES
  });
});

// @route   PUT /api/projects/:id/stages
// @desc    Update project stages
// @access  Private/Admin
router.put('/:id/stages', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { stages } = req.body;
    
    // Calculate overall progress from stages
    const completedStages = stages.filter(s => s.status === 'COMPLETED').length;
    const progress = Math.round((completedStages / stages.length) * 100);
    
    // Determine project status based on stages
    let status = 'PLANNING';
    if (stages.some(s => s.status === 'IN_PROGRESS')) status = 'STRUCTURE';
    if (stages.filter(s => s.status === 'COMPLETED').length > 3) status = 'FINISHING';
    if (stages.every(s => s.status === 'COMPLETED')) status = 'COMPLETED';
    
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { stages, progress, status }
    });
    
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/projects/customer/:customerId
// @desc    Get all projects for a specific customer
// @access  Private/Admin
router.get('/customer/:customerId', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const projects = await prisma.project.findMany({
      where: { clientId: req.params.customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: { select: { id: true, stageName: true, amount: true, status: true } },
        _count: { select: { documents: true, workerLogs: true } }
      }
    });
    
    res.json({
      success: true,
      count: projects.length,
      data: projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
