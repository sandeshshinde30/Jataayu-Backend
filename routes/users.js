const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');

// Get all users (admin only)
router.get('/',
  auth,
  checkRole(['admin']),
  async (req, res) => {
    try {
      const users = await User.find()
        .select('-password')
        .sort({ createdAt: -1 });
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get block officers (admin only)
router.get('/block-officers',
  auth,
  checkRole(['admin']),
  async (req, res) => {
    try {
      const officers = await User.find({ role: 'block_officer' }).select('-password');
      res.json(officers);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update user role (admin only)
router.put('/:id/role',
  auth,
  checkRole(['admin']),
  [
    body('role').isIn(['admin', 'block_officer', 'public']).withMessage('Invalid role'),
    body('district').if(body('role').equals('block_officer')).notEmpty().withMessage('District is required for block officers'),
    body('officialRole').if(body('role').equals('Official_member')).notEmpty().withMessage('Official role is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { role, district, officialRole } = req.body;

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.role = role;
      user.district = role === 'block_officer' ? district : undefined;
      if (role === 'Official_member') {
        user.officialRole = officialRole;
      } else {
        user.officialRole = undefined;
      }

      await user.save();
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete user (admin only)
router.delete('/:id',
  auth,
  checkRole(['admin']),
  async (req, res) => {
    try {
      // Prevent admin from deleting themselves
      if (req.params.id === req.user._id.toString()) {
        return res.status(403).json({ message: 'Admin cannot delete their own account' });
      }

      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      await user.deleteOne();
      res.json({ message: 'User deleted' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get all officials
router.get('/officials', auth, checkRole(['admin']), async (req, res) => {
  try {
    const officials = await User.find({ role: 'Official_member' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(officials);
  } catch (error) {
    console.error('Get officials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update official
router.put('/officials/:id', auth, checkRole(['admin']), async (req, res) => {
  try {
    const { name, email, password, officialRole } = req.body;
    const official = await User.findById(req.params.id);

    if (!official || official.role !== 'Official_member') {
      return res.status(404).json({ message: 'Official not found' });
    }

    official.name = name;
    official.email = email;
    official.officialRole = officialRole;

    if (password) {
      official.password = password;
    }

    await official.save();
    res.json({
      message: 'Official updated successfully',
      official: {
        id: official._id,
        name: official.name,
        email: official.email,
        officialRole: official.officialRole
      }
    });
  } catch (error) {
    console.error('Update official error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete official
router.delete('/officials/:id', auth, checkRole(['admin']), async (req, res) => {
  try {
    const official = await User.findById(req.params.id);

    if (!official || official.role !== 'Official_member') {
      return res.status(404).json({ message: 'Official not found' });
    }

    // Prevent admin from deleting themselves if they are somehow marked as an official
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot delete your own account' });
    }

    await official.deleteOne();
    res.json({ message: 'Official deleted successfully' });
  } catch (error) {
    console.error('Delete official error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 