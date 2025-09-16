const TokenService = require('../services/token.service');
const UserRepository = require('../repositories/user.repository');
const { AppError } = require('../utils/errors');
const logger = require('../../config/logger');

// Кеш для користувачів (в production краще використовувати Redis)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 хвилин

// Очищення кешу
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userCache.delete(key);
    }
  }
};

// Періодичне очищення кешу
setInterval(cleanupCache, 60 * 1000); // Кожну хвилину

/**
 * Middleware для перевірки автентифікації
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authenticate = async (req, res, next) => {
  try {
    // Отримання токена з Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Токен авторизації не надано', 401);
    }

    const token = authHeader.split(' ')[1];

    // Валідація access token
    const decoded = TokenService.validateAccessToken(token);

    // Перевірка кешу
    const cacheKey = `${decoded.userId}-${decoded.iat}`;
    if (userCache.has(cacheKey)) {
      const cached = userCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        req.user = cached.user;
        return next();
      } else {
        userCache.delete(cacheKey);
      }
    }

    // Пошук користувача в базі
    const user = await UserRepository.findById(decoded.userId);
    
    if (!user) {
      throw new AppError('Користувача не знайдено', 401);
    }

    // Attach user data to request (без чутливих даних)
    req.user = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName
    };

    // Збереження в кеш
    userCache.set(cacheKey, {
      user: req.user,
      timestamp: Date.now()
    });

    // Логування авторизованого запиту
    logger.info(`Авторизований запит від користувача: ${user.email}`, {
      userId: user._id,
      endpoint: req.originalUrl,
      method: req.method
    });

    next();
  } catch (error) {
    // Не логуємо токен в помилках для безпеки
    if (error instanceof AppError) {
      logger.warn(`Помилка автентифікації: ${error.message}`, {
        endpoint: req.originalUrl,
        ip: req.ip
      });
      return next(error);
    }

    logger.error('Неочікувана помилка автентифікації', {
      error: error.message,
      endpoint: req.originalUrl,
      ip: req.ip
    });
    
    next(new AppError('Не авторизований доступ', 401));
  }
};

/**
 * Middleware для перевірки адмінських прав
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authorizeAdmin = async (req, res, next) => {
  try {
    // Перевірка чи користувач авторизований
    if (!req.user) {
      throw new AppError('Потрібна автентифікація', 401);
    }

    // Отримання повної інформації про користувача для перевірки ролі
    const user = await UserRepository.findById(req.user.id);
    
    if (!user) {
      throw new AppError('Користувача не знайдено', 401);
    }

    // Перевірка адмінських прав (припускаємо, що є поле role)
    if (user.role !== 'admin') {
      logger.warn(`Спроба доступу адміністратора без прав: ${user.email}`, {
        userId: user._id,
        endpoint: req.originalUrl
      });
      throw new AppError('Недостатньо прав для виконання цієї дії', 403);
    }

    // Логування адміністративного запиту
    logger.info(`Адміністративний запит: ${user.email}`, {
      userId: user._id,
      endpoint: req.originalUrl,
      method: req.method
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    
    logger.error('Неочікувана помилка авторизації адміністратора', {
      error: error.message,
      endpoint: req.originalUrl
    });
    
    next(new AppError('Помилка перевірки прав доступу', 500));
  }
};

/**
 * Middleware для опціональної автентифікації
 * Дозволяє продовжити виконання навіть якщо користувач не авторизований
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const optionalAuth = async (req, res, next) => {
  try {
    // Отримання токена з Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    // Валідація access token
    const decoded = TokenService.validateAccessToken(token);

    // Перевірка кешу
    const cacheKey = `${decoded.userId}-${decoded.iat}`;
    if (userCache.has(cacheKey)) {
      const cached = userCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        req.user = cached.user;
        return next();
      } else {
        userCache.delete(cacheKey);
      }
    }

    // Пошук користувача в базі
    const user = await UserRepository.findById(decoded.userId);
    
    if (!user) {
      return next();
    }

    // Attach user data to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName
    };

    // Збереження в кеш
    userCache.set(cacheKey, {
      user: req.user,
      timestamp: Date.now()
    });

    next();
  } catch (error) {
    // Якщо токен недійсний, продовжуємо без авторизації
    next();
  }
};

module.exports = {
  authenticate,
  authorizeAdmin,
  optionalAuth
};