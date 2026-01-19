const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Default worker categories (can be extended with custom categories)
const DEFAULT_CATEGORIES = {
  HELPER_MALE: { name: 'Helper (Male)', defaultRate: 500 },
  HELPER_FEMALE: { name: 'Helper (Female)', defaultRate: 400 },
  MASON: { name: 'Mason', defaultRate: 800 },
  LABOUR: { name: 'Labour', defaultRate: 500 },
  CIVIL_MANAGER: { name: 'Civil Manager', defaultRate: 1500 },
  BAR_BENDER: { name: 'Bar Bender', defaultRate: 900 },
  ELECTRICIAN: { name: 'Electrician', defaultRate: 800 },
  PLUMBER: { name: 'Plumber', defaultRate: 800 },
  CARPENTER: { name: 'Carpenter', defaultRate: 700 },
  GRILL_WORKER: { name: 'Grill Worker', defaultRate: 700 },
  TILE_WORKER: { name: 'Tile Worker', defaultRate: 800 },
  PAINTER: { name: 'Painter', defaultRate: 700 }
};

// Calculate wage based on shift, hours, and shift fraction
function calculateWage(count, ratePerWorker, hoursWorked, shift, shiftFraction = 1.0) {
  let multiplier = 1;
  if (shift === 'NIGHT') multiplier = 1.25;
  if (shift === 'FULL_DAY') multiplier = 1.5;
  if (shift === 'HALF_DAY') multiplier = 0.5;
  
  const baseHours = 8;
  const overtimeRate = 1.5;
  
  if (hoursWorked <= baseHours) {
    return count * ratePerWorker * (hoursWorked / baseHours) * multiplier * shiftFraction;
  } else {
    const regularPay = count * ratePerWorker * multiplier * shiftFraction;
    const overtimeHours = hoursWorked - baseHours;
    const overtimePay = count * (ratePerWorker / baseHours) * overtimeHours * overtimeRate * multiplier;
    return regularPay + overtimePay;
  }
}

// Get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// @route   GET /api/workforce/categories
// @desc    Get all worker categories (default + custom)
router.get('/categories', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    // Get custom categories from database
    const customCategories = await prisma.customWorkerCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    
    // Combine default and custom
    const allCategories = [
      ...Object.entries(DEFAULT_CATEGORIES).map(([id, data]) => ({
        id,
        name: data.name,
        defaultRate: data.defaultRate,
        isCustom: false
      })),
      ...customCategories.map(c => ({
        id: c.id,
        name: c.name,
        defaultRate: c.defaultRate,
        description: c.description,
        isCustom: true
      }))
    ];
    
    res.json({ success: true, data: allCategories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/workforce/categories
// @desc    Create custom worker category
router.post('/categories', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name, defaultRate, description } = req.body;
    
    const category = await prisma.customWorkerCategory.create({
      data: {
        name,
        defaultRate: parseFloat(defaultRate) || 500,
        description
      }
    });
    
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/categories/:id
// @desc    Update custom category
router.put('/categories/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name, defaultRate, description, isActive } = req.body;
    
    const category = await prisma.customWorkerCategory.update({
      where: { id: req.params.id },
      data: { name, defaultRate, description, isActive }
    });
    
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/workforce
// @desc    Get all worker logs with filters
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, category, status, startDate, endDate, hasMistake, weekNumber, weekYear } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    if (category) where.category = category;
    if (status) where.status = status;
    if (hasMistake === 'true') where.hasMistake = true;
    if (weekNumber) where.weekNumber = parseInt(weekNumber);
    if (weekYear) where.weekYear = parseInt(weekYear);
    if (startDate && endDate) {
      where.date = { gte: new Date(startDate), lte: new Date(endDate) };
    }
    
    const workerLogs = await prisma.workerLog.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { project: { select: { id: true, name: true } } }
    });
    
    res.json({ success: true, count: workerLogs.length, data: workerLogs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/workforce
// @desc    Create worker log with enhanced fields
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      category, customCategory, workerName, workerRole, count, shift, 
      shiftFraction, date, hoursWorked, ratePerWorker, projectId, notes 
    } = req.body;
    
    const logDate = date ? new Date(date) : new Date();
    const hours = parseInt(hoursWorked) || 8;
    const fraction = parseFloat(shiftFraction) || 1.0;
    const rate = parseFloat(ratePerWorker) || DEFAULT_CATEGORIES[category]?.defaultRate || 500;
    const totalWage = calculateWage(parseInt(count) || 1, rate, hours, shift || 'DAY', fraction);
    
    const workerLog = await prisma.workerLog.create({
      data: {
        category: customCategory || category,
        customCategory,
        workerName,
        workerRole,
        count: parseInt(count) || 1,
        shift: shift || 'DAY',
        shiftFraction: fraction,
        date: logDate,
        hoursWorked: hours,
        ratePerWorker: rate,
        totalWage,
        weekNumber: getWeekNumber(logDate),
        weekYear: logDate.getFullYear(),
        projectId,
        notes
      }
    });
    
    res.status(201).json({ success: true, data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id/verify
// @desc    Verify work completion
router.put('/:id/verify', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: {
        workVerified: true,
        verifiedAt: new Date(),
        verifiedBy: req.user.id
      }
    });
    
    res.json({ success: true, message: 'Work verified', data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id/mistake
// @desc    Report a mistake/issue with work
router.put('/:id/mistake', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { mistakeDescription, faultTolerance } = req.body;
    
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: {
        hasMistake: true,
        mistakeDescription,
        faultTolerance: faultTolerance || 'MEDIUM'
      }
    });
    
    res.json({ success: true, message: 'Mistake reported', data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id/acknowledge-mistake
// @desc    Acknowledge a mistake
router.put('/:id/acknowledge-mistake', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: {
        mistakeAcknowledged: true,
        mistakeAcknowledgedAt: new Date()
      }
    });
    
    res.json({ success: true, message: 'Mistake acknowledged', data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id
// @desc    Update worker log
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      category, customCategory, workerName, workerRole, count, shift, 
      shiftFraction, hoursWorked, ratePerWorker, notes, status 
    } = req.body;
    
    const currentLog = await prisma.workerLog.findUnique({ where: { id: req.params.id } });
    if (!currentLog) {
      return res.status(404).json({ success: false, message: 'Worker log not found' });
    }
    
    const newCount = count !== undefined ? parseInt(count) : currentLog.count;
    const newRate = ratePerWorker !== undefined ? parseFloat(ratePerWorker) : currentLog.ratePerWorker;
    const newHours = hoursWorked !== undefined ? parseInt(hoursWorked) : currentLog.hoursWorked;
    const newShift = shift || currentLog.shift;
    const newFraction = shiftFraction !== undefined ? parseFloat(shiftFraction) : currentLog.shiftFraction;
    
    const totalWage = calculateWage(newCount, newRate, newHours, newShift, newFraction);
    
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: {
        category: category || undefined,
        customCategory,
        workerName,
        workerRole,
        count: newCount,
        shift: newShift,
        shiftFraction: newFraction,
        hoursWorked: newHours,
        ratePerWorker: newRate,
        totalWage,
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined
      }
    });
    
    res.json({ success: true, data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/workforce/:id
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.workerLog.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Worker log deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id/pay
// @desc    Mark single log as paid
router.put('/:id/pay', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: { status: 'PAID' }
    });
    res.json({ success: true, data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/workforce/weekly/:weekNumber/:weekYear
// @desc    Get weekly summary for payment
router.get('/weekly/:weekNumber/:weekYear', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { weekNumber, weekYear } = req.params;
    const { projectId } = req.query;
    
    let where = {
      weekNumber: parseInt(weekNumber),
      weekYear: parseInt(weekYear)
    };
    if (projectId) where.projectId = projectId;
    
    const logs = await prisma.workerLog.findMany({
      where,
      include: { project: { select: { id: true, name: true } } }
    });
    
    // Group by category
    const byCategory = {};
    logs.forEach(log => {
      if (!byCategory[log.category]) {
        byCategory[log.category] = {
          category: log.category,
          totalWorkers: 0,
          totalWage: 0,
          logs: []
        };
      }
      byCategory[log.category].totalWorkers += log.count;
      byCategory[log.category].totalWage += log.totalWage;
      byCategory[log.category].logs.push(log);
    });
    
    res.json({
      success: true,
      data: {
        weekNumber: parseInt(weekNumber),
        weekYear: parseInt(weekYear),
        totalLogs: logs.length,
        totalWage: logs.reduce((sum, l) => sum + l.totalWage, 0),
        totalPending: logs.filter(l => l.status === 'PENDING').reduce((sum, l) => sum + l.totalWage, 0),
        totalPaid: logs.filter(l => l.status === 'PAID').reduce((sum, l) => sum + l.totalWage, 0),
        byCategory: Object.values(byCategory)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/workforce/weekly/:weekNumber/:weekYear/pay-all
// @desc    Pay all pending wages for a week
router.post('/weekly/:weekNumber/:weekYear/pay-all', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { weekNumber, weekYear } = req.params;
    const { projectId } = req.body;
    
    let where = {
      weekNumber: parseInt(weekNumber),
      weekYear: parseInt(weekYear),
      status: 'PENDING'
    };
    if (projectId) where.projectId = projectId;
    
    const result = await prisma.workerLog.updateMany({
      where,
      data: { status: 'PAID' }
    });
    
    res.json({ success: true, message: `${result.count} logs marked as paid` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/workforce/stats
// @desc    Get workforce statistics
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    
    const workerLogs = await prisma.workerLog.findMany({ where });
    
    const byCategory = {};
    workerLogs.forEach(log => {
      if (!byCategory[log.category]) {
        byCategory[log.category] = {
          count: 0, totalWorkers: 0, totalWage: 0, paid: 0, pending: 0,
          withMistakes: 0
        };
      }
      byCategory[log.category].count++;
      byCategory[log.category].totalWorkers += log.count;
      byCategory[log.category].totalWage += log.totalWage;
      if (log.status === 'PAID') {
        byCategory[log.category].paid += log.totalWage;
      } else {
        byCategory[log.category].pending += log.totalWage;
      }
      if (log.hasMistake) {
        byCategory[log.category].withMistakes++;
      }
    });
    
    const totalWages = workerLogs.reduce((sum, l) => sum + l.totalWage, 0);
    const paidWages = workerLogs.filter(l => l.status === 'PAID').reduce((sum, l) => sum + l.totalWage, 0);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalLogs: workerLogs.length,
          totalWorkerDays: workerLogs.reduce((sum, l) => sum + l.count, 0),
          totalWages,
          paidWages,
          pendingWages: totalWages - paidWages,
          logsWithMistakes: workerLogs.filter(l => l.hasMistake).length
        },
        byCategory: Object.entries(byCategory).map(([category, data]) => ({
          category,
          categoryName: DEFAULT_CATEGORIES[category]?.name || category,
          ...data
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/workforce/project/:projectId/summary
router.get('/project/:projectId/summary', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const workerLogs = await prisma.workerLog.findMany({
      where: { projectId: req.params.projectId }
    });
    
    const byCategory = {};
    workerLogs.forEach(log => {
      if (!byCategory[log.category]) {
        byCategory[log.category] = {
          categoryName: DEFAULT_CATEGORIES[log.category]?.name || log.category,
          totalDays: 0, totalWorkers: 0, totalWage: 0
        };
      }
      byCategory[log.category].totalDays++;
      byCategory[log.category].totalWorkers += log.count;
      byCategory[log.category].totalWage += log.totalWage;
    });
    
    res.json({
      success: true,
      data: {
        projectId: req.params.projectId,
        totalLogs: workerLogs.length,
        totalWage: workerLogs.reduce((sum, l) => sum + l.totalWage, 0),
        categories: Object.entries(byCategory).map(([id, data]) => ({ id, ...data }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

