const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');
const { auth, checkRole } = require('../middleware/auth');
const EventRegistration = require('../models/EventRegistration');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and documents
    if (file.fieldname === 'images') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for images'), false);
      }
    } else if (file.fieldname === 'reports') {
      const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Only PDF and Word documents are allowed for reports'), false);
      }
    }
    cb(null, true);
  }
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'reports', maxCount: 5 }
]);

// Create event
router.post('/',
  auth,
  checkRole(['admin', 'block_officer', 'Official_member']),
  upload,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('district').trim().notEmpty().withMessage('District is required'),
    body('date').isISO8601().toDate().withMessage('Valid date is required'),
    body('time').optional().isString().withMessage('Time should be in a valid format')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, location, district, date, time } = req.body;

      // Upload images to Cloudinary only if images are provided
      let images = [];
      if (req.files && req.files.images && req.files.images.length > 0) {
        const imageUploadPromises = req.files.images.map(file => {
          return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'events/images',
                resource_type: 'image'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve({ url: result.secure_url, publicId: result.public_id });
              }
            );

            stream.end(file.buffer);
          });
        });

        images = await Promise.all(imageUploadPromises);
      }

      // Upload reports to Cloudinary
      let reports = [];
      if (req.files && req.files.reports && req.files.reports.length > 0) {
        const reportUploadPromises = req.files.reports.map(file => {
          return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'events/reports',
                resource_type: 'raw',
                access_mode: 'public',
                use_filename: true,
                unique_filename: true,
                type: 'upload'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve({
                  filename: file.originalname,
                  size: file.size,
                  mimetype: file.mimetype,
                  fileUrl: result.secure_url,
                  publicId: result.public_id
                });
              }
            );

            stream.end(file.buffer);
          });
        });

        reports = await Promise.all(reportUploadPromises);
      }

      const event = new Event({
        title,
        description,
        location,
        district,
        date,
        time,
        images,
        reports,
        createdBy: req.user._id
      });

      await event.save();

      // Find all users to notify
      const usersToNotify = await User.find({});

      // Send notifications to all users except the event creator
      const notificationPromises = usersToNotify.map(user => {
        // Don't notify the event creator
        if (user._id.toString() === req.user._id.toString()) return null;

        return NotificationService.createNotification(
          user._id,
          'New Event Created',
          `A new event "${title}" has been created in ${district}`,
          'info',
          `/events/${event._id}`
        );
      });

      // Filter out null promises (for event creator) and wait for all notifications
      await Promise.all(notificationPromises.filter(Boolean));

      res.status(201).json(event);
    } catch (error) {
      console.error('Error creating event:', error);
      if (error.name === 'MulterError') {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get all events with optional filtering
router.get('/', async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
    }

    if (type !== 'all') {
      const now = new Date();
      if (type === 'upcoming') {
        query.date = { $gte: now };
      } else if (type === 'past') {
        query.date = { $lt: now };
      }
    }

    const events = await Event.find(query)
      .sort(type === 'upcoming' ? { date: 1 } : { date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email');

    const total = await Event.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      events,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get events created by a specific user
router.get('/my-events', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const events = await Event.find({ createdBy: req.user.id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email');

    // Get registration counts for each event
    const eventsWithRegistrations = await Promise.all(
      events.map(async (event) => {
        const registrations = await EventRegistration.find({ event: event._id });
        return {
          ...event.toObject(),
          registrationCount: registrations.length,
          registrations: registrations
        };
      })
    );

    const total = await Event.countDocuments({ createdBy: req.user.id });
    const totalPages = Math.ceil(total / limit);

    res.json({
      events: eventsWithRegistrations,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get a single event with its registrations
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!event) {
      return res.status(404).json({ msg: 'Event not found' });
    }

    // If user is authenticated and is the creator, include registrations
    if (req.user && event.createdBy._id.toString() === req.user.id) {
      const registrations = await EventRegistration.find({ event: event._id });
      return res.json({
        ...event.toObject(),
        registrations
      });
    }

    res.json(event);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Get unique districts
router.get('/districts', async (req, res) => {
  try {
    const districts = await Event.distinct('district');
    res.json(districts.sort());
  } catch (error) {
    console.error('Error fetching districts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update event
router.put('/:id',
  auth,
  checkRole(['admin', 'block_officer', 'Official_member']),
  upload,
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      // Check if user is authorized to update
      if (event.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Handle existing images and reports
      let existingImages = [];
      let existingReports = [];
      
      if (req.body.existingImages) {
        const existingImageIds = JSON.parse(req.body.existingImages);
        existingImages = event.images.filter(img => existingImageIds.includes(img._id.toString()));
      }
      
      if (req.body.existingReports) {
        const existingReportIds = JSON.parse(req.body.existingReports);
        existingReports = event.reports.filter(report => existingReportIds.includes(report._id.toString()));
      }

      // Handle new image uploads
      let newImages = [];
      if (req.files && req.files.images) {
        const imageUploadPromises = req.files.images.map(file => {
          return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'events/images',
                resource_type: 'image'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve({ url: result.secure_url, publicId: result.public_id });
              }
            );
            stream.end(file.buffer);
          });
        });
        newImages = await Promise.all(imageUploadPromises);
      }

      // Handle new report uploads
      let newReports = [];
      if (req.files && req.files.reports) {
        const reportUploadPromises = req.files.reports.map(file => {
          return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'events/reports',
                resource_type: 'raw',
                access_mode: 'public',
                use_filename: true,
                unique_filename: true,
                type: 'upload'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve({
                  filename: file.originalname,
                  size: file.size,
                  mimetype: file.mimetype,
                  fileUrl: result.secure_url,
                  publicId: result.public_id
                });
              }
            );
            stream.end(file.buffer);
          });
        });
        newReports = await Promise.all(reportUploadPromises);
      }

      // Delete removed files from Cloudinary
      const removedImages = event.images.filter(img => 
        !existingImages.some(existing => existing._id.toString() === img._id.toString())
      );
      const removedReports = event.reports.filter(report => 
        !existingReports.some(existing => existing._id.toString() === report._id.toString())
      );

      const deletePromises = [
        ...removedImages.map(image => cloudinary.uploader.destroy(image.publicId)),
        ...removedReports.map(report => cloudinary.uploader.destroy(report.publicId, { resource_type: 'raw' }))
      ];
      await Promise.all(deletePromises);

      // Update the event with new data
      const updatedEventData = {
        ...req.body,
        images: [...existingImages, ...newImages],
        reports: [...existingReports, ...newReports]
      };

      // Remove the stringified arrays from the update data
      delete updatedEventData.existingImages;
      delete updatedEventData.existingReports;

      const updatedEvent = await Event.findByIdAndUpdate(
        req.params.id,
        { $set: updatedEventData },
        { new: true }
      ).populate('createdBy', 'name email');

      res.json(updatedEvent);
    } catch (error) {
      console.error('Error updating event:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Delete event
router.delete('/:id',
  auth,
  checkRole(['admin', 'block_officer', 'Official_member']),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }

      // Check if user is authorized to delete
      if (event.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Delete images and reports from Cloudinary
      const deletePromises = [
        ...event.images.map(image => cloudinary.uploader.destroy(image.publicId)),
        ...event.reports.map(report => cloudinary.uploader.destroy(report.publicId, { resource_type: 'raw' }))
      ];
      await Promise.all(deletePromises);

      await event.deleteOne();
      res.json({ message: 'Event deleted' });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router; 