const express = require('express');
const rateLimit = require('express-rate-limit');
const SyncController = require('../controllers/sync.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { AppError } = require('../utils/errors');

const router = express.Router();

// Rate limiting middleware для різних типів операцій
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на завантаження даних, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на отримання даних, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const statusLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на отримання статусу, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на масову синхронізацію, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/sync/upload
 * @desc    Завантаження офлайн даних правопорушень
 * @access  Private
 */
router.post(
  '/upload',
  authenticate,
  uploadLimiter,
  (req, res, next) => SyncController.upload(req, res, next)
);

/**
 * @route   GET /api/sync/pending
 * @desc    Отримання несинхронізованих правопорушень
 * @access  Private
 */
router.get(
  '/pending',
  authenticate,
  readLimiter,
  (req, res, next) => SyncController.getPending(req, res, next)
);

/**
 * @route   GET /api/sync/status
 * @desc    Отримання статусу синхронізації
 * @access  Private
 */
router.get(
  '/status',
  authenticate,
  statusLimiter,
  (req, res, next) => SyncController.getStatus(req, res, next)
);

/**
 * @route   POST /api/sync/bulk
 * @desc    Масова синхронізація правопорушень
 * @access  Private
 */
router.post(
  '/bulk',
  authenticate,
  bulkLimiter,
  (req, res, next) => SyncController.bulkSync(req, res, next)
);

/**
 * @route   GET /api/sync/report
 * @desc    Отримання детального звіту про синхронізацію
 * @access  Private
 */
router.get(
  '/report',
  authenticate,
  statusLimiter,
  (req, res, next) => SyncController.getReport(req, res, next)
);

/**
 * @route   POST /api/sync/cleanup
 * @desc    Очищення синхронізованих даних
 * @access  Private
 */
router.post(
  '/cleanup',
  authenticate,
  uploadLimiter,
  (req, res, next) => SyncController.cleanup(req, res, next)
);

/**
 * @route   PUT /api/sync/status
 * @desc    Оновлення статусу синхронізації конкретного правопорушення
 * @access  Private
 */
router.put(
  '/status',
  authenticate,
  readLimiter,
  (req, res, next) => SyncController.updateStatus(req, res, next)
);

/**
 * @route   GET /api/sync/progress
 * @desc    Отримання поточного прогресу синхронізації
 * @access  Private
 */
router.get(
  '/progress',
  authenticate,
  statusLimiter,
  (req, res, next) => SyncController.getProgress(req, res, next)
);

/**
 * @route   POST /api/sync/single
 * @desc    Синхронізація одного правопорушення
 * @access  Private
 */
router.post(
  '/single',
  authenticate,
  uploadLimiter,
  (req, res, next) => SyncController.syncSingle(req, res, next)
);

// Обробка 404 для неіснуючих ендпойнтів
router.use((req, res, next) => {
  next(new AppError(`Не знайдено ендпойнт ${req.originalUrl}`, 404));
});

module.exports = router;    