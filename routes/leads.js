const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/leads
// @desc    Get all leads with filters
router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { stage, source, priority, assignedToId } = req.query;
    
    let where = {};
    if (stage) where.stage = stage;
    if (source) where.source = source;
    if (priority) where.priority = priority;
    if (assignedToId) where.assignedToId = assignedToId;
    
    const leads = await prisma.lead.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { nextFollowUp: 'asc' },
        { createdAt: 'desc' }
      ],
      include: {
        followUps: {
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      }
    });
    
    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/leads/pipeline
// @desc    Get leads grouped by stage (Kanban view)
router.get('/pipeline', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];
    const pipeline = {};
    
    for (const stage of stages) {
      const leads = await prisma.lead.findMany({
        where: { stage },
        orderBy: { updatedAt: 'desc' },
        include: {
          followUps: {
            orderBy: { scheduledAt: 'asc' },
            where: { isCompleted: false },
            take: 1
          }
        }
      });
      pipeline[stage] = leads;
    }
    
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/leads
// @desc    Create new lead
router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { 
      name, phone, email, address, source, interest, budget,
      priority, temperature, assignedToId, notes, tags 
    } = req.body;
    
    const lead = await prisma.lead.create({
      data: {
        name, phone, email, address,
        source: source || 'WEBSITE',
        interest, budget: budget ? parseFloat(budget) : null,
        priority: priority || 'MEDIUM',
        temperature,
        assignedToId,
        notes,
        tags: tags || [],
        stageHistory: JSON.stringify([{
          stage: 'NEW',
          date: new Date().toISOString(),
          note: 'Lead created'
        }])
      }
    });
    
    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/leads/:id
// @desc    Update lead
router.put('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: req.body
    });
    
    res.json({ success: true, data: lead });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/leads/:id/stage
// @desc    Move lead to new stage
router.put('/:id/stage', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { stage, note } = req.body;
    
    const currentLead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!currentLead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    // Parse existing history or create new
    let history = [];
    try {
      history = JSON.parse(currentLead.stageHistory || '[]');
    } catch (e) {
      history = [];
    }
    
    history.push({
      stage,
      date: new Date().toISOString(),
      previousStage: currentLead.stage,
      note: note || `Moved to ${stage}`
    });
    
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        stage,
        stageHistory: JSON.stringify(history)
      }
    });
    
    res.json({ success: true, message: `Lead moved to ${stage}`, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/leads/:id/follow-up
// @desc    Add follow-up to lead
router.post('/:id/follow-up', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { type, notes, scheduledAt, nextAction } = req.body;
    
    const followUp = await prisma.followUp.create({
      data: {
        leadId: req.params.id,
        type: type || 'CALL',
        notes,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        nextAction,
        createdById: req.user.id
      }
    });
    
    // Update lead's follow-up count and next follow-up date
    await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        followUpCount: { increment: 1 },
        nextFollowUp: scheduledAt ? new Date(scheduledAt) : null
      }
    });
    
    res.status(201).json({ success: true, data: followUp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/leads/follow-up/:id/complete
// @desc    Mark follow-up as completed
router.put('/follow-up/:id/complete', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { outcome, nextAction, nextFollowUpDate } = req.body;
    
    const followUp = await prisma.followUp.update({
      where: { id: req.params.id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        outcome,
        nextAction
      }
    });
    
    // Update lead's last contact date
    await prisma.lead.update({
      where: { id: followUp.leadId },
      data: {
        lastContactDate: new Date(),
        nextFollowUp: nextFollowUpDate ? new Date(nextFollowUpDate) : null
      }
    });
    
    res.json({ success: true, data: followUp });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/leads/:id/convert
// @desc    Convert lead to project
router.post('/:id/convert', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { projectName, budget, description } = req.body;
    
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    // Create project from lead
    const project = await prisma.project.create({
      data: {
        name: projectName || `${lead.name} Project`,
        description: description || lead.interest,
        budget: budget || lead.budget || 0,
        status: 'ACTIVE'
      }
    });
    
    // Update lead as converted
    await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        isConverted: true,
        convertedToProjectId: project.id,
        convertedAt: new Date(),
        stage: 'WON'
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Lead converted to project',
      data: { lead, project }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/leads/:id/lose
// @desc    Mark lead as lost
router.put('/:id/lose', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { reason } = req.body;
    
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        stage: 'LOST',
        lostReason: reason
      }
    });
    
    res.json({ success: true, message: 'Lead marked as lost', data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/leads/:id
router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Lead deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/leads/stats
// @desc    Get lead pipeline statistics
router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const leads = await prisma.lead.findMany();
    
    const byStage = {};
    const bySource = {};
    
    leads.forEach(lead => {
      byStage[lead.stage] = (byStage[lead.stage] || 0) + 1;
      bySource[lead.source] = (bySource[lead.source] || 0) + 1;
    });
    
    const today = new Date();
    const overdueFollowUps = leads.filter(l => 
      l.nextFollowUp && new Date(l.nextFollowUp) < today && l.stage !== 'WON' && l.stage !== 'LOST'
    ).length;
    
    const todayFollowUps = leads.filter(l => {
      if (!l.nextFollowUp) return false;
      const followUp = new Date(l.nextFollowUp);
      return followUp.toDateString() === today.toDateString();
    }).length;
    
    res.json({
      success: true,
      data: {
        total: leads.length,
        byStage,
        bySource,
        overdueFollowUps,
        todayFollowUps,
        conversionRate: leads.length > 0 
          ? ((leads.filter(l => l.isConverted).length / leads.length) * 100).toFixed(1)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
