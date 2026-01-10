const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Worker categories with default rates
const WORKER_CATEGORIES = {
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

// Calculate wage based on shift and hours
function calculateWage(count, ratePerWorker, hoursWorked, shift) {
  let multiplier = 1;
  if (shift === 'NIGHT') multiplier = 1.25; // 25% extra for night shift
  if (shift === 'FULL_DAY') multiplier = 1.5; // 50% extra for full day
  
  // Standard 8 hours, calculate overtime
  const baseHours = 8;
  const overtimeRate = 1.5;
  
  if (hoursWorked <= baseHours) {
    return count * ratePerWorker * (hoursWorked / baseHours) * multiplier;
  } else {
    const regularPay = count * ratePerWorker * multiplier;
    const overtimeHours = hoursWorked - baseHours;
    const overtimePay = count * (ratePerWorker / baseHours) * overtimeHours * overtimeRate * multiplier;
    return regularPay + overtimePay;
  }
}

// @route   GET /api/workforce/categories
// @desc    Get all worker categories with default rates
router.get('/categories', protect, (req, res) => {
  res.json({
    success: true,
    data: Object.entries(WORKER_CATEGORIES).map(([key, value]) => ({
      id: key,
      ...value
    }))
  });
});

// @route   GET /api/workforce
// @desc    Get all worker logs
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, category, status, startDate, endDate } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    if (category) where.category = category;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
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

// @route   GET /api/workforce/stats
// @desc    Get workforce statistics
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    
    const workerLogs = await prisma.workerLog.findMany({ where });
    
    // Group by category
    const byCategory = {};
    workerLogs.forEach(log => {
      if (!byCategory[log.category]) {
        byCategory[log.category] = {
          count: 0,
          totalWorkers: 0,
          totalWage: 0,
          paid: 0,
          pending: 0
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
    });
    
    const totalWages = workerLogs.reduce((sum, l) => sum + l.totalWage, 0);
    const paidWages = workerLogs.filter(l => l.status === 'PAID').reduce((sum, l) => sum + l.totalWage, 0);
    const pendingWages = totalWages - paidWages;
    const totalWorkerDays = workerLogs.reduce((sum, l) => sum + l.count, 0);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalLogs: workerLogs.length,
          totalWorkerDays,
          totalWages,
          paidWages,
          pendingWages
        },
        byCategory: Object.entries(byCategory).map(([category, data]) => ({
          category,
          categoryName: WORKER_CATEGORIES[category]?.name || category,
          ...data
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/workforce
// @desc    Create worker log
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { category, count, shift, date, hoursWorked, ratePerWorker, projectId, notes } = req.body;
    
    const hours = parseInt(hoursWorked) || 8;
    const rate = parseFloat(ratePerWorker) || WORKER_CATEGORIES[category]?.defaultRate || 500;
    const totalWage = calculateWage(parseInt(count), rate, hours, shift || 'DAY');
    
    const workerLog = await prisma.workerLog.create({
      data: {
        category,
        count: parseInt(count),
        shift: shift || 'DAY',
        date: date ? new Date(date) : new Date(),
        hoursWorked: hours,
        ratePerWorker: rate,
        totalWage,
        projectId,
        notes
      }
    });
    res.status(201).json({ success: true, data: workerLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/workforce/:id
// @desc    Update worker log
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { category, count, shift, hoursWorked, ratePerWorker, notes, status } = req.body;
    
    // Get current log to calculate new wage if needed
    const currentLog = await prisma.workerLog.findUnique({ where: { id: req.params.id } });
    if (!currentLog) {
      return res.status(404).json({ success: false, message: 'Worker log not found' });
    }
    
    const newCount = count !== undefined ? parseInt(count) : currentLog.count;
    const newRate = ratePerWorker !== undefined ? parseFloat(ratePerWorker) : currentLog.ratePerWorker;
    const newHours = hoursWorked !== undefined ? parseInt(hoursWorked) : currentLog.hoursWorked;
    const newShift = shift || currentLog.shift;
    
    const totalWage = calculateWage(newCount, newRate, newHours, newShift);
    
    const workerLog = await prisma.workerLog.update({
      where: { id: req.params.id },
      data: {
        category: category || undefined,
        count: newCount,
        shift: newShift,
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

// @route   PUT /api/workforce/pay-all
// @desc    Mark all pending logs as paid
router.put('/pay-all', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, category } = req.body;
    
    let where = { status: 'PENDING' };
    if (projectId) where.projectId = projectId;
    if (category) where.category = category;
    
    const result = await prisma.workerLog.updateMany({
      where,
      data: { status: 'PAID' }
    });
    res.json({ success: true, message: `${result.count} logs marked as paid` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/workforce/project/:projectId/summary
// @desc    Get workforce summary for a project
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
          categoryName: WORKER_CATEGORIES[log.category]?.name || log.category,
          totalDays: 0,
          totalWorkers: 0,
          totalWage: 0
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
