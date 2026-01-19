const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// Load environment variables
dotenv.config();

// Database URL from environment or fallback
const databaseUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_cjO1uSK2vhHi@ep-noisy-surf-a4vrzvxi-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

// Initialize Prisma Client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const materialRoutes = require('./routes/materials');
const workforceRoutes = require('./routes/workforce');
const vendorRoutes = require('./routes/vendors');
const transactionRoutes = require('./routes/transactions');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');
const customerRoutes = require('./routes/customers');
const paymentRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');

// Initialize Express app
const app = express();

// Make prisma available to routes
app.set('prisma', prisma);

// Middleware - Allow all origins for mobile app connectivity
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/workforce', workforceRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      success: true, 
      message: 'D Square CRM Server is running',
      database: 'Connected to Neon PostgreSQL',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      success: true, 
      message: 'D Square CRM Server is running',
      database: 'Error: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [
      totalProjects,
      activeProjects,
      projects,
      materials,
      workerLogs,
      transactions
    ] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: { not: 'COMPLETED' } } }),
      prisma.project.findMany({ select: { budget: true, spent: true } }),
      prisma.material.findMany({ select: { cost: true, status: true } }),
      prisma.workerLog.findMany({ select: { totalWage: true, status: true, count: true } }),
      prisma.transaction.findMany({ select: { amount: true, type: true } })
    ]);

    const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
    const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
    
    const pendingMaterials = materials.filter(m => m.status === 'PENDING').length;
    const materialCost = materials.reduce((sum, m) => sum + m.cost, 0);
    
    const pendingWages = workerLogs
      .filter(w => w.status === 'PENDING')
      .reduce((sum, w) => sum + w.totalWage, 0);
    const activeWorkers = workerLogs.reduce((sum, w) => sum + w.count, 0);
    
    const totalCredits = transactions
      .filter(t => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      data: {
        projects: { total: totalProjects, active: activeProjects, totalBudget, totalSpent },
        materials: { pending: pendingMaterials, totalCost: materialCost },
        workforce: { pendingWages, activeWorkers },
        finance: { credits: totalCredits, debits: totalDebits, balance: totalCredits - totalDebits }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal Server Error' 
  });
});

// Database connection and server start
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully (Neon PostgreSQL)');
    
    app.listen(PORT, () => {
      console.log(`🚀 D Square CRM Server running on port ${PORT}`);
      console.log(`📍 API available at http://localhost:${PORT}/api`);
      console.log(`🏥 Health check at http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.log('⚠️  Server starting without database connection...');
    
    // Start server anyway for development
    app.listen(PORT, () => {
      console.log(`🚀 D Square CRM Server running on port ${PORT} (No DB)`);
    });
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
