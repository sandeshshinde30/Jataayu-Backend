const mongoose = require('mongoose');

const fileSchema = {
  filename: String,
  path: String,
  mimetype: String,
  size: Number
};

const initiativeSchema = new mongoose.Schema({
  initiative: {
    type: String,
    required: true,
    enum: ['rehabilitation', 'outreach', 'education', 'policy']
  },
  subCategory: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  images: [fileSchema],
  videos: [fileSchema],
  documents: [fileSchema],
  audio: [fileSchema],
  listItems: [{
    type: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

initiativeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Initiative', initiativeSchema); 