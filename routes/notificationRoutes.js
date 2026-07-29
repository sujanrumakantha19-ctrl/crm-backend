const express = require('express');
const router = express.Router();

const {
  getNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notificationController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Notification = require('../models/Notification');

// Specific routes BEFORE parameterized routes
router.route('/unread').get(protect, getUnreadNotifications);
router.route('/read/all').put(protect, markAllAsRead);
router.route('/:id/read').put(protect, markAsRead);

router
  .route('/')
  .get(protect, (req, res, next) => { req.query.userId = req.user.id; next(); }, advancedResults(Notification), getNotifications)
  .post(protect, createNotification);

router
  .route('/:id')
  .get(protect, getNotification)
  .put(protect, updateNotification)
  .delete(protect, deleteNotification);

module.exports = router;
