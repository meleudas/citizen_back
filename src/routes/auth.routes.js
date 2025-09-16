const express = require('express');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const { 
  registerValidation, 
  loginValidation, 
  refreshValidation, 
  changePasswordValidation,
  resetPasswordValidation,
  forgotPasswordValidation,
  validate 
} = require('../validators/auth.validator');
const { authenticate } = require('../middleware/auth.middleware');
const { AppError } = require('../utils/errors');

const router = express.Router();

// Rate limiting middleware
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на реєстрацію, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато спроб входу, спробуйте пізніше'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Занадто багато запитів на оновлення токенів'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   POST /api/auth/register
 * @desc    Реєстрація нового користувача
 * @access  Public
 */
router.post(
  '/register',
  registerLimiter,
  registerValidation,
  validate,
  (req, res, next) => AuthController.register(req, res, next)
);

/**
 * @route   POST /api/auth/login
 * @desc    Вхід користувача в систему
 * @access  Public
 */
router.post(
  '/login',
  loginLimiter,
  loginValidation,
  validate,
  (req, res, next) => AuthController.login(req, res, next)
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Оновлення access токена за допомогою refresh токена
 * @access  Public
 */
router.post(
  '/refresh',
  refreshLimiter,
  refreshValidation,
  validate,
  (req, res, next) => AuthController.refresh(req, res, next)
);

/**
 * @route   POST /api/auth/logout
 * @desc    Вихід користувача з системи
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  (req, res, next) => AuthController.logout(req, res, next)
);

/**
 * @route   GET /api/auth/me
 * @desc    Отримання інформації про поточного користувача
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  (req, res, next) => AuthController.getCurrentUser(req, res, next)
);

/**
 * @route   PUT /api/auth/password
 * @desc    Зміна пароля користувача
 * @access  Private
 */
router.put(
  '/password',
  authenticate,
  changePasswordValidation,
  validate,
  (req, res, next) => AuthController.changePassword(req, res, next)
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Запит на скидання пароля
 * @access  Public
 */
router.post(
  '/forgot-password',
  forgotPasswordValidation,
  validate,
  (req, res, next) => AuthController.forgotPassword(req, res, next)
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Скидання пароля за токеном
 * @access  Public
 */
router.post(
  '/reset-password',
  resetPasswordValidation,
  validate,
  (req, res, next) => AuthController.resetPassword(req, res, next)
);

// Обробка 404 для неіснуючих ендпойнтів
router.use((req, res, next) => {
  next(new AppError(`Не знайдено ендпойнт ${req.originalUrl}`, 404));
});

module.exports = router;