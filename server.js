const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const https = require('https');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { CLIENT_URL, MONGODB_URI } = require('./config');

// Load environment variables
dotenv.config();


// SSL Certificate paths
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/backend.zpsanglijataayu.in/privkey.pem', 'utf8'),
  cert: fs.readFileSync('/etc/letsencrypt/live/backend.zpsanglijataayu.in/fullchain.pem', 'utf8'),
};

// Create Express app
const app = express();

// Create HTTPS server
const server = https.createServer(sslOptions, app);
// Define allowed origin
const corsOptions = {
  origin: (origin, callback) => {
    console.log("Request Origin:", origin); // DEBUG
    if (!origin || origin === CLIENT_URL) {
      callback(null, true);
    } else {
      callback(new Error('CORS error: Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma']
};

// Apply CORS middleware once
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight globally

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Socket.IO connection handling
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      connectedUsers.set(decoded.userId, socket.id);
      console.log(`User ${decoded.userId} authenticated`);
    } catch (error) {
      console.error('Socket authentication error:', error);
    }
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
const eventRegistrationsRoutes = require('./routes/eventRegistrations');
app.use('/api/event-registrations', eventRegistrationsRoutes);
app.use('/api/initiatives', require('./routes/initiatives'));

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start HTTPS server
const PORT = 443;
server.listen(PORT, () => {
  console.log(`🚀 HTTPS Server running on port ${PORT}`);
});
