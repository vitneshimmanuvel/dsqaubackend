const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/analytics/overview
// @desc    Get overall financial overview
// @access  Private/Admin
router.get('/overview', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId, startDate, endDate } = req.query;
    
    // Base filters
    let projectFilter = projectId ? { projectId } : {};
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }
    
    // Get payments data
    const payments = await prisma.payment.findMany({
      where: { ...projectFilter, ...dateFilter }
    });
    
    // Get materials data
    const materials = await prisma.material.findMany({
      where: { ...projectFilter, ...dateFilter }
    });
    
    // Get workforce data
    const workerLogs = await prisma.workerLog.findMany({
      where: { ...projectFilter, ...dateFilter }
    });
    
    // Calculate income (payments received)
    const totalIncome = payments.reduce((sum, p) => sum + p.paidAmount, 0);
    const pendingIncome = payments.reduce((sum, p) => sum + (p.amount - p.paidAmount), 0);
    
    // Calculate expenses
    const materialExpense = materials.reduce((sum, m) => sum + m.paidAmount, 0);
    const laborExpense = workerLogs
      .filter(w => w.status === 'PAID')
      .reduce((sum, w) => sum + w.totalWage, 0);
    const totalExpense = materialExpense + laborExpense;
    
    // Pending expenses
    const pendingMaterial = materials.reduce((sum, m) => sum + m.remainingAmount, 0);
    const pendingLabor = workerLogs
      .filter(w => w.status !== 'PAID')
      .reduce((sum, w) => sum + w.totalWage, 0);
    const pendingExpense = pendingMaterial + pendingLabor;
    
    // Profit/Loss
    const profit = totalIncome - totalExpense;
    
    res.json({
      success: true,
      data: {
        income: {
          total: totalIncome,
          pending: pendingIncome
        },
        expense: {
          total: totalExpense,
          materials: materialExpense,
          labor: laborExpense,
          pending: pendingExpense
        },
        profit: {
          current: profit,
          margin: totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(2) : 0
        },
        counts: {
          projects: await prisma.project.count(),
          activeProjects: await prisma.project.count({ where: { status: 'ACTIVE' } }),
          vendors: await prisma.vendor.count({ where: { isActive: true } }),
          pendingPayments: payments.filter(p => p.status !== 'PAID').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/analytics/monthly
// @desc    Get monthly financial data for charts
// @access  Private/Admin
router.get('/monthly', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    
    const months = [];
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 0, 23, 59, 59);
      
      // Get payments for this month
      const payments = await prisma.payment.findMany({
        where: {
          paidDate: { gte: startDate, lte: endDate }
        }
      });
      
      // Get materials paid this month
      const materialPayments = await prisma.materialPayment.findMany({
        where: {
          paymentDate: { gte: startDate, lte: endDate }
        }
      });
      
      // Get workforce paid this month
      const workerLogs = await prisma.workerLog.findMany({
        where: {
          status: 'PAID',
          date: { gte: startDate, lte: endDate }
        }
      });
      
      const income = payments.reduce((sum, p) => sum + p.paidAmount, 0);
      const materialExpense = materialPayments.reduce((sum, m) => sum + m.amount, 0);
      const laborExpense = workerLogs.reduce((sum, w) => sum + w.totalWage, 0);
      const expense = materialExpense + laborExpense;
      
      months.push({
        month: month + 1,
        monthName: startDate.toLocaleString('default', { month: 'short' }),
        income,
        expense,
        profit: income - expense,
        materialExpense,
        laborExpense
      });
    }
    
    res.json({ success: true, data: months });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/analytics/projects
// @desc    Get project-wise analytics
// @access  Private/Admin
router.get('/projects', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const projects = await prisma.project.findMany({
      where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: {
        payments: true,
        materials: true,
        workerLogs: true
      }
    });
    
    const projectStats = projects.map(project => {
      const income = project.payments.reduce((sum, p) => sum + p.paidAmount, 0);
      const materialCost = project.materials.reduce((sum, m) => sum + m.paidAmount, 0);
      const laborCost = project.workerLogs
        .filter(w => w.status === 'PAID')
        .reduce((sum, w) => sum + w.totalWage, 0);
      const totalExpense = materialCost + laborCost;
      
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        budget: project.budget,
        income,
        expense: totalExpense,
        materialCost,
        laborCost,
        profit: income - totalExpense,
        progress: project.budget > 0 
          ? ((income / project.budget) * 100).toFixed(1) 
          : 0
      };
    });
    
    res.json({ success: true, data: projectStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/analytics/expense-breakdown
// @desc    Get expense breakdown by category
// @access  Private/Admin
router.get('/expense-breakdown', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectId } = req.query;
    
    let where = {};
    if (projectId) where.projectId = projectId;
    
    // Materials by type
    const materials = await prisma.material.findMany({ where });
    const materialByType = {};
    materials.forEach(m => {
      const type = m.materialType || 'Other';
      if (!materialByType[type]) materialByType[type] = 0;
      materialByType[type] += m.paidAmount;
    });
    
    // Labor by category
    const workerLogs = await prisma.workerLog.findMany({
      where: { ...where, status: 'PAID' }
    });
    const laborByCategory = {};
    workerLogs.forEach(w => {
      if (!laborByCategory[w.category]) laborByCategory[w.category] = 0;
      laborByCategory[w.category] += w.totalWage;
    });
    
    res.json({
      success: true,
      data: {
        materials: Object.entries(materialByType).map(([type, amount]) => ({
          type, amount
        })),
        labor: Object.entries(laborByCategory).map(([category, amount]) => ({
          category, amount
        })),
        totals: {
          materials: materials.reduce((sum, m) => sum + m.paidAmount, 0),
          labor: workerLogs.reduce((sum, w) => sum + w.totalWage, 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/analytics/weekly-workforce
// @desc    Get weekly workforce cost trend
// @access  Private/Admin
router.get('/weekly-workforce', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { weeks = 12 } = req.query;
    
    const now = new Date();
    const weeksData = [];
    
    for (let i = parseInt(weeks) - 1; i >= 0; i--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - (i * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      
      const logs = await prisma.workerLog.findMany({
        where: {
          date: { gte: weekStart, lte: weekEnd }
        }
      });
      
      weeksData.push({
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        totalWage: logs.reduce((sum, l) => sum + l.totalWage, 0),
        workerCount: logs.reduce((sum, l) => sum + l.count, 0),
        logCount: logs.length
      });
    }
    
    res.json({ success: true, data: weeksData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
