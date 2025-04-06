const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Initiative = require('../models/Initiative');
const { auth } = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/initiatives';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'video/mp4',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg',     // MP3
      'audio/wav',      // WAV
      'audio/ogg',      // OGG
      'audio/aac'       // AAC
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get all initiatives with filtering options
router.get('/', async (req, res) => {
  try {
    let query = {};
    
    // Filter by category if provided
    if (req.query.category) {
      query.initiative = req.query.category;
    }
    
    // Filter by subcategory if provided
    if (req.query.subCategory) {
      query.subCategory = req.query.subCategory;
    }
    
    // Limit results if specified
    const limit = req.query.limit ? parseInt(req.query.limit) : 0;
    
    console.log('Initiative API query:', JSON.stringify(query));
    
    const initiatives = await Initiative.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
    
    console.log(`Found ${initiatives.length} initiatives for query: ${JSON.stringify(query)}`);
    
    // If no results found, log additional info to help debugging
    if (initiatives.length === 0) {
      // Check if any initiatives exist at all
      const totalCount = await Initiative.countDocuments({});
      console.log(`Total initiatives in database: ${totalCount}`);
      
      // If we have initiatives but none match the query, check what categories/subcategories exist
      if (totalCount > 0) {
        const allCategories = await Initiative.distinct('initiative');
        const allSubCategories = await Initiative.distinct('subCategory');
        console.log('Available categories:', allCategories);
        console.log('Available subCategories:', allSubCategories);
      }
    }
      
    res.json(initiatives);
  } catch (error) {
    console.error('Error in initiatives API:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create new initiative (admin only)
router.post('/', auth, isAdmin, upload.array('files'), async (req, res) => {
  try {
    const { initiative, subCategory, title, description, content } = req.body;
    const listItems = JSON.parse(req.body.listItems || '[]');
    
    const files = req.files || [];
    const images = [];
    const videos = [];
    const documents = [];
    const audio = [];  // Added for audio files

    // Categorize new files
    files.forEach(file => {
      const fileData = {
        filename: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size
      };

      if (file.mimetype.startsWith('image/')) {
        images.push(fileData);
      } else if (file.mimetype.startsWith('video/')) {
        videos.push(fileData);
      } else if (file.mimetype.startsWith('audio/')) {
        audio.push(fileData);
      } else {
        documents.push(fileData);
      }
    });

    // Add existing files
    const existingImages = JSON.parse(req.body.existingImages || '[]');
    const existingVideos = JSON.parse(req.body.existingVideos || '[]');
    const existingDocuments = JSON.parse(req.body.existingDocuments || '[]');
    const existingAudio = JSON.parse(req.body.existingAudio || '[]');

    images.push(...existingImages);
    videos.push(...existingVideos);
    documents.push(...existingDocuments);
    audio.push(...existingAudio);

    const newInitiative = new Initiative({
      initiative,
      subCategory,
      title,
      description,
      content,
      images,
      videos,
      documents,
      audio,
      listItems,
      createdBy: req.user.id
    });

    const savedInitiative = await newInitiative.save();
    res.status(201).json(savedInitiative);
  } catch (error) {
    // Clean up uploaded files if there's an error
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    res.status(400).json({ message: error.message });
  }
});

// Update initiative (admin only)
router.put('/:id', auth, isAdmin, upload.array('files'), async (req, res) => {
  try {
    const initiative = await Initiative.findById(req.params.id);
    if (!initiative) {
      return res.status(404).json({ message: 'Initiative not found' });
    }

    console.log('Updating initiative ID:', req.params.id);
    console.log('Received files:', req.files ? req.files.length : 0);

    const { title, description, content, initiative: initiativeType, subCategory } = req.body;
    const listItems = JSON.parse(req.body.listItems || '[]');
    
    const files = req.files || [];
    const images = [];
    const videos = [];
    const documents = [];
    const audio = [];  // Added for audio files

    // Categorize new files
    console.log('Categorizing uploaded files...');
    files.forEach(file => {
      const fileData = {
        originalname: file.originalname,
        filename: file.filename,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size
      };

      console.log('Processing file:', file.originalname, 'type:', file.mimetype);

      if (file.mimetype.startsWith('image/')) {
        console.log('Categorized as image');
        images.push(fileData);
      } else if (file.mimetype.startsWith('video/')) {
        console.log('Categorized as video');
        videos.push(fileData);
      } else if (file.mimetype.startsWith('audio/')) {
        console.log('Categorized as audio');
        audio.push(fileData);
      } else {
        console.log('Categorized as document');
        documents.push(fileData);
      }
    });

    // Add existing files
    try {
      const existingImages = JSON.parse(req.body.existingImages || '[]');
      const existingVideos = JSON.parse(req.body.existingVideos || '[]');
      const existingDocuments = JSON.parse(req.body.existingDocuments || '[]');
      const existingAudio = JSON.parse(req.body.existingAudio || '[]');

      console.log('Existing images:', existingImages.length);
      console.log('Existing videos:', existingVideos.length);
      console.log('Existing documents:', existingDocuments.length);
      console.log('Existing audio:', existingAudio.length);

      images.push(...existingImages);
      videos.push(...existingVideos);
      documents.push(...existingDocuments);
      audio.push(...existingAudio);
      
      console.log('Total images after merge:', images.length);
      console.log('Total videos after merge:', videos.length);
      console.log('Total documents after merge:', documents.length);
      console.log('Total audio after merge:', audio.length);
    } catch (error) {
      console.error('Error processing existing files:', error);
    }

    // Delete old files that are not in existing files
    const oldImages = initiative.images || [];
    const oldVideos = initiative.videos || [];
    const oldDocuments = initiative.documents || [];
    const oldAudio = initiative.audio || [];

    console.log('Original document count:', oldDocuments.length);

    try {
      const existingImagePaths = (JSON.parse(req.body.existingImages || '[]')).map(f => f.path);
      const existingVideoPaths = (JSON.parse(req.body.existingVideos || '[]')).map(f => f.path);
      const existingDocumentPaths = (JSON.parse(req.body.existingDocuments || '[]')).map(f => f.path);
      const existingAudioPaths = (JSON.parse(req.body.existingAudio || '[]')).map(f => f.path);
      
      console.log('Existing document paths:', existingDocumentPaths);

      [...oldImages, ...oldVideos, ...oldDocuments, ...oldAudio].forEach(file => {
        if (!existingImagePaths.includes(file.path) && 
            !existingVideoPaths.includes(file.path) && 
            !existingDocumentPaths.includes(file.path) &&
            !existingAudioPaths.includes(file.path)) {
          console.log('Deleting unused file:', file.path);
          fs.unlink(file.path, err => {
            if (err) console.error('Error deleting old file:', err);
          });
        } else {
          console.log('Keeping file:', file.path);
        }
      });
    } catch (error) {
      console.error('Error cleaning up old files:', error);
    }

    const updates = {
      title,
      description,
      content,
      initiative: initiativeType,
      subCategory,
      images,
      videos,
      documents,
      audio,
      listItems
    };

    console.log('Updating with document count:', documents.length);

    const updatedInitiative = await Initiative.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    console.log('Updated initiative document count:', updatedInitiative.documents.length);
    res.json(updatedInitiative);
  } catch (error) {
    console.error('Error updating initiative:', error);
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    res.status(400).json({ message: error.message });
  }
});

// Delete initiative (admin only)
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const initiative = await Initiative.findById(req.params.id);
    if (!initiative) {
      return res.status(404).json({ message: 'Initiative not found' });
    }

    // Delete associated files
    initiative.images.forEach(file => {
      fs.unlink(file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    });
    initiative.videos.forEach(file => {
      fs.unlink(file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    });
    initiative.documents.forEach(file => {
      fs.unlink(file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    });
    initiative.audio.forEach(file => {
      fs.unlink(file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    });

    await Initiative.findByIdAndDelete(req.params.id);
    res.json({ message: 'Initiative deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a single initiative by ID
router.get('/:id', async (req, res) => {
  try {
    console.log(`Fetching initiative with ID: ${req.params.id}`);
    const initiative = await Initiative.findById(req.params.id);
    if (!initiative) {
      console.log(`Initiative with ID ${req.params.id} not found`);
      return res.status(404).json({ message: 'Initiative not found' });
    }
    
    console.log(`Found initiative: ${initiative.title}`);
    res.json(initiative);
  } catch (error) {
    console.error(`Error fetching initiative ${req.params.id}:`, error);
    res.status(500).json({ message: error.message });
  }
});

// Debugging endpoint to check what's in the database (admin only)
router.get('/debug', auth, isAdmin, async (req, res) => {
  try {
    // Get count of all initiatives
    const totalCount = await Initiative.countDocuments({});
    
    // Get distinct categories and subcategories
    const categories = await Initiative.distinct('initiative');
    const subcategories = await Initiative.distinct('subCategory');
    
    // Get count by category
    const countByCategory = {};
    for (const category of categories) {
      countByCategory[category] = await Initiative.countDocuments({ initiative: category });
    }
    
    // Get count by subcategory
    const countBySubcategory = {};
    for (const subcategory of subcategories) {
      countBySubcategory[subcategory] = await Initiative.countDocuments({ subCategory: subcategory });
    }
    
    // Get sample data for each category/subcategory
    const samples = {};
    for (const category of categories) {
      samples[category] = {};
      for (const subcategory of subcategories) {
        const sample = await Initiative.findOne({ 
          initiative: category, 
          subCategory: subcategory 
        });
        if (sample) {
          samples[category][subcategory] = {
            id: sample._id,
            title: sample.title,
            createdAt: sample.createdAt
          };
        }
      }
    }
    
    res.json({
      totalCount,
      categories,
      subcategories,
      countByCategory,
      countBySubcategory,
      samples
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 