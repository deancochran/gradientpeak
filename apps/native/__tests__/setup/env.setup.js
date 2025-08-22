// Jest environment setup for React Native
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';