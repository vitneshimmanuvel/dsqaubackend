const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/notifications
router.get('/', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/notifications/unread
router.get('/unread', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const count = await prisma.notification.count({
      where: { userId: req.user.id, read: false }
    });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/notifications/:id/read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/notifications/read-all
router.put('/read-all', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true }
    });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/notifications/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
