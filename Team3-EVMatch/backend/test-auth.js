const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function testAuth() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create test user
        const email = 'testuser@example.com';
        const password = 'Test123!@#';

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            console.log('Deleting existing user...');
            await User.deleteOne({ email });
        }

        console.log('Creating new user...');
        // Don't hash manually - let the model's pre-save hook do it
        user = new User({
            firstName: 'Test',
            lastName: 'User',
            email: email,
            password: password, // Use plain password
            isEmailVerified: true
        });

        await user.save();
        console.log('User created successfully');

        // Test login
        console.log('Testing login...');
        const loginUser = await User.findOne({ email }).select('+password');
        console.log('User found:', !!loginUser);
        console.log('Password in DB:', loginUser?.password ? 'present' : 'missing');

        if (loginUser) {
            console.log('Plain password:', password);
            console.log('Hashed password (first 20 chars):', loginUser.password.substring(0, 20));
            console.log('Hash length:', loginUser.password.length);

            const isValid = await bcrypt.compare(password, loginUser.password);
            console.log('Password valid:', isValid);

            // Test with manual hash
            const testHash = await bcrypt.hash(password, 12);
            console.log('Test hash valid:', await bcrypt.compare(password, testHash));
        }

        await mongoose.disconnect();
        console.log('Test completed');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testAuth();
