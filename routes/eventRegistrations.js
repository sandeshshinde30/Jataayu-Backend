const express = require('express');
const router = express.Router();
const EventRegistration = require('../models/EventRegistration');
const Event = require('../models/Event');
const { auth } = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const NotificationService = require('../services/notificationService');

// Register for an event (no auth required)
router.post('/', [
  check('event', 'Event ID is required').not().isEmpty(),
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('phone', 'Phone number is required').not().isEmpty(),
  check('age', 'Age is required').isInt({ min: 1 }),
  check('gender', 'Gender is required').isIn(['male', 'female', 'other']),
  check('address', 'Address is required').not().isEmpty(),
  check('district', 'District is required').not().isEmpty(),
  check('taluka', 'Taluka is required').not().isEmpty(),
  check('village', 'Village is required').not().isEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const event = await Event.findById(req.body.event);
    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    const registration = new EventRegistration({
      ...req.body,
      status: 'pending'
    });

    await registration.save();

    // Send notification to event creator
    await NotificationService.createNotification(
      event.createdBy,
      'New Event Registration',
      `${registration.name} has registered for your event "${event.title}"`,
      'info',
      `/event-registrations/${event._id}`
    );

    res.json(registration);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get registrations for an event (auth required)
router.get('/event/:eventId', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Check if user is the creator or has been shared with
    if (event.createdBy.toString() !== req.user.id && 
        !event.sharedWith.includes(req.user.id)) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const registrations = await EventRegistration.find({ event: req.params.eventId })
      .sort({ createdAt: -1 });
    
    res.json(registrations);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Share registration with other users (auth required)
router.post('/share/:registrationId', auth, async (req, res) => {
  try {
    const registration = await EventRegistration.findById(req.params.registrationId);
    if (!registration) {
      return res.status(404).json({ msg: 'Registration not found' });
    }

    const event = await Event.findById(registration.event);
    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Check if user is the creator of the event
    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    // Add users to sharedWith array
    if (req.body.userIds && Array.isArray(req.body.userIds)) {
      registration.sharedWith = [...new Set([...registration.sharedWith, ...req.body.userIds])];
      await registration.save();

      // Send notifications to shared users
      for (const userId of req.body.userIds) {
        await NotificationService.createNotification(
          userId,
          'Event Registration Shared',
          `Event registration for "${event.title}" has been shared with you`,
          'info',
          `/event-registrations/${event._id}`
        );
      }
    }

    res.json(registration);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Update registration status (auth required)
router.put('/:registrationId/status', auth, async (req, res) => {
  try {
    const registration = await EventRegistration.findById(req.params.registrationId);
    if (!registration) {
      return res.status(404).json({ msg: 'Registration not found' });
    }

    const event = await Event.findById(registration.event);
    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // Check if user is the creator of the event
    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Not authorized' });
    }

    const oldStatus = registration.status;
    registration.status = req.body.status;
    await registration.save();

    // Send notification to the registrant's email about status change
    await NotificationService.createNotification(
      registration._id,
      'Registration Status Updated',
      `Your registration status for "${event.title}" has been updated from ${oldStatus} to ${req.body.status}`,
      'info',
      `/events/${event._id}`
    );

    res.json(registration);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router; 