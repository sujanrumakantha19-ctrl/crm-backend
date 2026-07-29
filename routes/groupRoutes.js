const express = require('express');
const router = express.Router();

const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
} = require('../controllers/groupController');

const { protect, authorize } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Group = require('../models/Group');

router.use(protect);

router
  .route('/')
  .get(advancedResults(Group, { path: 'members', select: 'name initials role' }), getGroups)
  .post(authorize('admin'), createGroup);

router
  .route('/:id')
  .get(getGroup)
  .put(authorize('admin'), updateGroup)
  .delete(authorize('admin'), deleteGroup);

router.post('/:id/members', authorize('admin'), addMember);
router.delete('/:id/members/:userId', authorize('admin'), removeMember);

module.exports = router;
