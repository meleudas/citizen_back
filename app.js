// app.js - виправлений файл

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
// const mongoSanitize = require('express-mongo-sanitize'); // Вже видалено
// const xss = require('xss-clean'); // ВИДАЛИТИ цей рядок
const hpp = require('hpp');
const path = require('path');

// Middleware
const { globalErrorHandler, notFound } = require('./src/middleware/error.middleware');
const { cors: corsMiddleware } = require('./src/middleware/cors.middleware');
const { helmet: helmetMiddleware } = require('./src/middleware/helmet.middleware');
const logger = require('./config/logger');

// Routes
const authRoutes = require('./src/routes/auth.routes');
const violationsRoutes = require('./src/routes/violations.routes');
// const syncRoutes = require('./src/routes/sync.routes');

const app = express();

// Логування запитів
app.use(logger.logRequest);

// Trust proxy (для production з reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
// app.use(mongoSanitize()); // Вже видалено
// app.use(xss()); // ВИДАЛИТИ цей рядок
app.use(hpp()); // Захист від HTTP Parameter Pollution

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb'
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Rate limiting для всіх запитів
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів з цього IP, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаємо певні маршрути
    const skipPaths = ['/api/health', '/api/ping'];
    return skipPaths.some(path => req.path.startsWith(path));
  }
});

app.use(globalLimiter);

// Slow down для запобігання brute force
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 100, // allow 100 requests per window, then start slowing down
  delayMs: () => 500, // нова поведінка
  validate: { delayMs: false } // вимикає попередження
});

app.use(speedLimiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/violations', violationsRoutes);
// app.use('/api/sync', syncRoutes);

// Documentation route
app.get('/api/docs', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      violations: '/api/violations',
      sync: '/api/sync'
    }
  });
});

// Serve static files for frontend (якщо потрібно)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware (має бути в кінці)
app.use(notFound);
app.use(globalErrorHandler);

// Обробка unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Обробка uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

module.exports = app;