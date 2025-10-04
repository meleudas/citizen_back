// middleware/error.middleware.js - виправлений файл

const logger = require('../../config/logger');
const { 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError, 
  NotFoundError,
  handleCastErrorDB,
  handleDuplicateFieldsDB,
  handleValidationErrorDB,
  handleJWTError,
  handleJWTExpiredError
} = require('../utils/errors');

// Глобальна обробка помилок
const globalErrorHandler = (err, req, res, next) => {
  // Логуємо помилку
  logger.logError(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Встановлюємо значення за замовчуванням
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Відправляємо детальну інформацію в development, просту в production
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    sendErrorProd(err, req, res);
  }
};

// Відправка помилки в development
const sendErrorDev = (err, req, res) => {
  // Для API запитів
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      details: err.details
    });
  }

  // Для веб запитів (видалено render через відсутність view engine)
  console.error('ERROR 💥', err);
  return res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message
  });
};

// Відправка помилки в production
const sendErrorProd = (err, req, res) => {
  // Для API запитів
  if (req.originalUrl.startsWith('/api')) {
    // Операційні помилки, які ми можемо передати клієнту
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        details: err.details
      });
    }

    // Програмні або інші невідомі помилки - не відправляємо деталі клієнту
    logger.error('ERROR 💥', err);
    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Щось пішло не так!'
    });
  }

  // Для веб запитів
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message
    });
  }

  // Програмні помилки
  logger.error('ERROR 💥', err);
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Please try again later.'
  });
};

// Обробка помилок Mongoose
const handleMongooseErrors = (err) => {
  if (err.name === 'CastError') return handleCastErrorDB(err);
  if (err.code === 11000) return handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') return handleValidationErrorDB(err);
  if (err.name === 'JsonWebTokenError') return handleJWTError();
  if (err.name === 'TokenExpiredError') return handleJWTExpiredError();
  return err;
};

// Обробка помилок валідації Joi (якщо використовується)
const handleJoiValidationErrors = (err) => {
  if (err.isJoi) {
    const details = err.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return new ValidationError('Помилка валідації хуй', details);
  }
  return err;
};

// Обробка помилок rate limiting
const handleRateLimitErrors = (err) => {
  if (err.name === 'TooManyRequestsError' || err.statusCode === 429) {
    return new AppError('Занадто багато запитів, спробуйте пізніше', 429);
  }
  return err;
};

// Middleware для 404 помилок
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Не знайдено ${req.originalUrl}`);
  next(error);
};

// Middleware для обробки помилок async функцій
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Експорт усіх компонентів
module.exports = {
  globalErrorHandler,
  notFound,
  catchAsync,
  handleMongooseErrors,
  handleJoiValidationErrors,
  handleRateLimitErrors
};