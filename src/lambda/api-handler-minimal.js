const serverlessExpress = require('@vendia/serverless-express');
const express = require('express');
const cors = require('cors');

// Create minimal Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service is running on AWS Lambda',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Basic API info
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Magnolia V2 API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/*'
    }
  });
});

// Placeholder for API routes
app.all('/api/*', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Full API deployment in progress. This is a minimal deployment for testing.',
    path: req.path,
    method: req.method
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Create serverless app
const serverlessApp = serverlessExpress({ app });

// Lambda handler
exports.handler = (event, context) => {
  return serverlessApp(event, context);
};