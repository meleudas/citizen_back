// utils/errors.js

class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Класи для специфічних помилок

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Не авторизований доступ') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Недостатньо прав для виконання цієї дії') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Ресурс не знайдено') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Конфлікт даних') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class UploadError extends AppError {
  constructor(message = 'Помилка завантаження файлу') {
    super(message, 422);
    this.name = 'UploadError';
  }
}

class DeleteError extends AppError {
  constructor(message = 'Помилка видалення файлу') {
    super(message, 422);
    this.name = 'DeleteError';
  }
}

class SyncError extends AppError {
  constructor(message = 'Помилка синхронізації') {
    super(message, 422);
    this.name = 'SyncError';
  }
}

class PartialSyncError extends AppError {
  constructor(message = 'Часткова помилка синхронізації', details = null) {
    super(message, 422, details);
    this.name = 'PartialSyncError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Занадто багато запитів, спробуйте пізніше') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Помилка бази даних') {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'Помилка зовнішнього сервісу') {
    super(message, 502);
    this.name = 'ExternalServiceError';
  }
}

// Фабричні методи для створення помилок

const createError = {
  validation: (message, details) => new ValidationError(message, details),
  authentication: (message) => new AuthenticationError(message),
  authorization: (message) => new AuthorizationError(message),
  notFound: (message) => new NotFoundError(message),
  conflict: (message) => new ConflictError(message),
  upload: (message) => new UploadError(message),
  delete: (message) => new DeleteError(message),
  sync: (message) => new SyncError(message),
  partialSync: (message, details) => new PartialSyncError(message, details),
  rateLimit: (message) => new RateLimitError(message),
  database: (message) => new DatabaseError(message),
  external: (message) => new ExternalServiceError(message),
  generic: (message, statusCode, details) => new AppError(message, statusCode, details)
};

// Функція для обробки помилок CastError (Mongoose)
const handleCastErrorDB = (err) => {
  const message = `Невірне значення ${err.value} для поля ${err.path}`;
  return new AppError(message, 400);
};

// Функція для обробки помилок дублікатів
const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Значення ${value} вже існує в базі даних`;
  return new AppError(message, 409);
};

// Функція для обробки помилок валідації
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Невірні вхідні дані: ${errors.join(', ')}`;
  return new AppError(message, 400);
};

// Функція для обробки помилок JWT
const handleJWTError = () => {
  return new AppError('Недійсний токен, будь ласка, авторизуйтесь знову', 401);
};

// Функція для обробки прострочених токенів
const handleJWTExpiredError = () => {
  return new AppError('Токен прострочений, будь ласка, авторизуйтесь знову', 401);
};

// Експорт усіх компонентів
module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  UploadError,
  DeleteError,
  SyncError,
  PartialSyncError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  createError,
  handleCastErrorDB,
  handleDuplicateFieldsDB,
  handleValidationErrorDB,
  handleJWTError,
  handleJWTExpiredError
};