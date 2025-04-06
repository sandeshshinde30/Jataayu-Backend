const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, checkRole } = require('../middleware/auth');

// Admin-only route to create Official_member
router.post('/create-official',
  auth,
  checkRole(['admin']),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('officialRole').trim().notEmpty().withMessage('Official role/designation is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, officialRole } = req.body;
      
      // Log the request for debugging
      console.log('Creating official member with data:', {
        name,
        email,
        officialRole,
        passwordLength: password ? password.length : 0,
        role: req.body.role // Check what's being passed in the role field
      });

      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create new official member - always use 'Official_member' role regardless of input
      user = new User({
        name,
        email,
        password,
        role: 'Official_member', // Force the correct role
        officialRole
      });

      await user.save();

      res.status(201).json({
        message: 'Official member created successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          officialRole: user.officialRole
        }
      });
    } catch (error) {
      console.error('Error creating official:', error.message, error.stack);
      res.status(500).json({ message: 'Server error', details: error.message });
    }
  }
);

// Update official member
router.put('/officials/:id',
  auth,
  checkRole(['admin']),
  [
    body('name').optional().trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Please enter a valid email'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('officialRole').optional().trim().notEmpty().withMessage('Official role/designation is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, officialRole } = req.body;
      const user = await User.findById(req.params.id);

      if (!user || user.role !== 'Official_member') {
        return res.status(404).json({ message: 'Official member not found' });
      }

      if (name) user.name = name;
      if (email) user.email = email;
      if (password) user.password = password;
      if (officialRole) user.officialRole = officialRole;

      await user.save();

      res.json({
        message: 'Official member updated successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          officialRole: user.officialRole
        }
      });
    } catch (error) {
      console.error('Error updating official:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Login user
router.post('/login',
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').exists().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          officialRole: user.officialRole
        }
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 