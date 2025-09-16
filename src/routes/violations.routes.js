// routes/violations.routes.js (оновлена версія - тільки створення приватне)

const express = require('express');
const rateLimit = require('express-rate-limit');
const ViolationsController = require('../controllers/violations.controller');
const { 
  createViolationValidation,
  syncViolationValidation,
  dateValidation,
  locationValidation,
  violationIdValidation,
  paginationValidation,
  statisticsValidation,
  dateRangeValidation,
  validate: handleValidationErrors
} = require('../validators/violations.validator');
const { authenticate } = require('../middleware/auth.middleware');
const { corsForApi } = require('../middleware/cors.middleware');
const { apiSecurity } = require('../middleware/helmet.middleware');
const { 
  uploadSingleImage, 
  handleMulterError, 
  bufferToBase64 
} = require('../middleware/upload.middleware');
const { AppError } = require('../utils/errors');

const router = express.Router();

// Застосування middleware для всіх маршрутів
router.use(corsForApi);
router.use(apiSecurity);

// Rate limiting middleware
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // limit each IP to 30 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на створення правопорушень, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const readLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // limit each IP to 500 requests per windowMs (більше для публічних даних)
  message: {
    success: false,
    message: 'Занадто багато запитів на отримання даних, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на видалення, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== ПУБЛІЧНІ ЕНДПОЙНТИ =====

/**
 * @route   GET /api/violations/dates
 * @desc    Отримання всіх дат правопорушень
 * @access  Public
 */
router.get(
  '/dates',
  readLimiter,
  (req, res, next) => ViolationsController.getDates(req, res, next)
);

/**
 * @route   GET /api/violations/by-date
 * @desc    Отримання правопорушень за конкретною датою
 * @access  Public
 */
router.get(
  '/by-date',
  readLimiter,
  dateValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getByDate(req, res, next)
);

/**
 * @route   GET /api/violations/by-date-range
 * @desc    Отримання правопорушень за діапазоном дат
 * @access  Public
 */
router.get(
  '/by-date-range',
  readLimiter,
  dateRangeValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getByDateRange(req, res, next)
);

/**
 * @route   POST /api/violations/by-location
 * @desc    Отримання правопорушень в радіусі від координат
 * @access  Public
 */
router.post(
  '/by-location',
  readLimiter,
  locationValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getByLocation(req, res, next)
);

/**
 * @route   GET /api/violations/:id
 * @desc    Отримання конкретного правопорушення
 * @access  Public
 */
router.get(
  '/:id',
  readLimiter,
  violationIdValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getById(req, res, next)
);

/**
 * @route   GET /api/violations
 * @desc    Отримання всіх правопорушень з пагінацією
 * @access  Public
 */
router.get(
  '/',
  readLimiter,
  paginationValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getViolations(req, res, next)
);

/**
 * @route   GET /api/violations/statistics
 * @desc    Отримання статистики правопорушень
 * @access  Public
 */
router.get(
  '/statistics',
  readLimiter,
  statisticsValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.getStatistics(req, res, next)
);

// ===== ПРИВАТНІ ЕНДПОЙНТИ (тільки створення) =====

/**
 * @route   POST /api/violations
 * @desc    Створення нового правопорушення
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  createLimiter,
  createViolationValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.create(req, res, next)
);

/**
 * @route   POST /api/violations/upload
 * @desc    Створення правопорушення з завантаженням зображення
 * @access  Private
 */
router.post(
  '/upload',
  authenticate,
  createLimiter,
  uploadSingleImage,
  handleMulterError,
  bufferToBase64,
  createViolationValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.create(req, res, next)
);

/**
 * @route   GET /api/violations/unsynced
 * @desc    Отримання несинхронізованих правопорушень
 * @access  Private
 */
router.get(
  '/unsynced',
  authenticate,
  readLimiter,
  (req, res, next) => ViolationsController.getUnsynced(req, res, next)
);

/**
 * @route   POST /api/violations/sync
 * @desc    Синхронізація локального правопорушення
 * @access  Private
 */
router.post(
  '/sync',
  authenticate,
  createLimiter,
  syncViolationValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.syncViolation(req, res, next)
);

/**
 * @route   PUT /api/violations/:id
 * @desc    Оновлення правопорушення
 * @access  Private
 */
router.put(
  '/:id',
  authenticate,
  createLimiter,
  violationIdValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.update(req, res, next)
);

/**
 * @route   DELETE /api/violations/:id
 * @desc    Видалення правопорушення
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  deleteLimiter,
  violationIdValidation,
  handleValidationErrors,
  (req, res, next) => ViolationsController.delete(req, res, next)
);

// Обробка 404 для неіснуючих ендпойнтів
router.use((req, res, next) => {
  next(new AppError(`Не знайдено ендпойнт ${req.originalUrl}`, 404));
});

module.exports = router;