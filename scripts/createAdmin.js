const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdminUser() {
  try {
    // Connect to MongoDB with correct database name
    console.log('Connecting to database...');
    await mongoose.connect('mongodb://localhost:27017/nasha-mukti');
    console.log('Connected to database successfully');
    
    // Delete any existing admin users
    console.log('Cleaning up existing admin users...');
    await User.deleteMany({ role: 'admin' });
    
    // Create admin user with plain password (will be hashed by the model)
    console.log('Creating new admin user...');
    const adminUser = new User({
      name: 'Admin',
      email: 'admin@nasha-mukti.com',
      password: 'password123', // Will be hashed by the pre-save hook
      role: 'admin'
    });

    await adminUser.save();
    console.log('Admin user created successfully with:');
    console.log('Email: admin@nasha-mukti.com');
    console.log('Password: password123');
    
    // Verify the user was created
    const verifyUser = await User.findOne({ email: 'admin@nasha-mukti.com' });
    if (verifyUser) {
      console.log('Verified: Admin user exists in database');
      
      // Test password comparison
      const isValidPassword = await verifyUser.comparePassword('password123');
      console.log('Password verification test:', isValidPassword ? 'PASSED' : 'FAILED');
    } else {
      console.log('Warning: Could not verify admin user in database');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser(); 