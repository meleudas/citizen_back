// services/token.service.js (оновлена версія з покращеним кешуванням)

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserRepository = require('../repositories/user.repository');
const { AppError, ValidationError } = require('../utils/errors');
const logger = require('../../config/logger');
const redis = require('redis');

class TokenService {
  constructor() {
    this.accessSecret = process.env.JWT_ACCESS_SECRET || 'access-secret-key';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
    this.resetSecret = process.env.JWT_RESET_SECRET || 'reset-secret-key';
    
    this.accessExpiresIn = process.env.JWT_ACCESS_EXPIRES || '1d';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES || '7d';
    this.resetExpiresIn = process.env.JWT_RESET_EXPIRES || '1h';

    // Ініціалізація Redis клієнта для кешування
    this.redisClient = null;
    this.initRedis();
  }

  // Ініціалізація Redis
  async initRedis() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({
          url: process.env.REDIS_URL,
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              logger.warn('Redis з\'єднання відхилено, використовується in-memory кеш');
              return new Error('Redis connection refused');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              logger.error('Redis retry time exceeded');
              return new Error('Retry time exhausted');
            }
            return Math.min(options.attempt * 100, 3000);
          }
        });

        this.redisClient.on('error', (err) => {
          logger.warn('Redis помилка:', err.message);
        });

        this.redisClient.on('connect', () => {
          logger.info('Redis підключено');
        });

        await this.redisClient.connect();
      } catch (error) {
        logger.warn('Не вдалося підключитися до Redis, використовується in-memory кеш:', error.message);
        this.redisClient = null;
      }
    } else {
      logger.info('Redis URL не встановлено, використовується in-memory кеш');
      this.redisClient = null;
    }

    // In-memory кеш як fallback
    this.memoryCache = new Map();
    this.cacheCleanupInterval = setInterval(() => this.cleanupMemoryCache(), 60000); // Кожну хвилину
  }

  // Очищення in-memory кешу
  cleanupMemoryCache() {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.timestamp > 5 * 60 * 1000) { // 5 хвилин TTL
        this.memoryCache.delete(key);
      }
    }
  }

  // Збереження в кеш
  async cacheSet(key, value, ttl = 300) { // 5 хвилин за замовчуванням
    try {
      if (this.redisClient) {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      } else {
        this.memoryCache.set(key, {
          value: value,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.warn('Помилка збереження в кеш:', error.message);
    }
  }

  // Отримання з кешу
  async cacheGet(key) {
    try {
      if (this.redisClient) {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        const cached = this.memoryCache.get(key);
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
          return cached.value;
        }
        this.memoryCache.delete(key);
        return null;
      }
    } catch (error) {
      logger.warn('Помилка отримання з кешу:', error.message);
      return null;
    }
  }

  // Видалення з кешу
  async cacheDel(key) {
    try {
      if (this.redisClient) {
        await this.redisClient.del(key);
      } else {
        this.memoryCache.delete(key);
      }
    } catch (error) {
      logger.warn('Помилка видалення з кешу:', error.message);
    }
  }

  // Генерація токенів
  generateTokens(payload) {
    try {
      const accessToken = jwt.sign(
        { userId: payload.userId, email: payload.email },
        this.accessSecret,
        { expiresIn: this.accessExpiresIn, algorithm: 'HS256' }
      );

      const refreshToken = jwt.sign(
        { 
          userId: payload.userId, 
          email: payload.email,
          tokenId: crypto.randomBytes(16).toString('hex')
        },
        this.refreshSecret,
        { expiresIn: this.refreshExpiresIn, algorithm: 'HS256' }
      );

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error(`Помилка генерації токенів: ${error.message}`);
      throw new AppError('Не вдалося згенерувати токени', 500);
    }
  }

  // Валідація access token
  validateAccessToken(token) {
    try {
      return jwt.verify(token, this.accessSecret);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Токен доступу прострочений', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Недійсний токен доступу', 401);
      }
      logger.error(`Помилка валідації access token: ${error.message}`);
      throw new AppError('Помилка валідації токена доступу', 401);
    }
  }

  // Валідація refresh token
  validateRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshSecret);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Refresh token прострочений', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Недійсний refresh token', 401);
      }
      logger.error(`Помилка валідації refresh token: ${error.message}`);
      throw new AppError('Помилка валідації refresh token', 401);
    }
  }

  // Збереження refresh token в базі
  async saveRefreshToken(userId, refreshToken) {
    try {
      const decoded = jwt.decode(refreshToken);
      if (!decoded) {
        throw new ValidationError('Недійсний refresh token');
      }

      const tokenData = {
        token: refreshToken,
        expiresAt: new Date(decoded.exp * 1000),
        createdAt: new Date()
      };

      // Отримуємо поточного користувача
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new AppError('Користувача не знайдено', 404);
      }

      // Видаляємо прострочені токени
      const cleanedTokens = user.refreshTokens.filter(tokenObj => 
        tokenObj.expiresAt > new Date()
      );

      // Обмежуємо кількість активних токенів до 5
      if (cleanedTokens.length >= 5) {
        cleanedTokens.sort((a, b) => b.createdAt - a.createdAt);
        cleanedTokens.splice(4); // Залишаємо тільки 5 найновіших
      }

      // Додаємо новий токен
      cleanedTokens.push(tokenData);

      // Оновлюємо користувача
      const updatedUser = await UserRepository.updateRefreshTokens(userId, cleanedTokens);
      
      // Кешуємо refresh token
      const cacheKey = `refresh_token:${userId}:${refreshToken}`;
      await this.cacheSet(cacheKey, tokenData, 7 * 24 * 60 * 60); // 7 днів
      
      logger.info(`Збережено refresh token для користувача ${userId}`);
      return updatedUser;

    } catch (error) {
      logger.error(`Помилка збереження refresh token: ${error.message}`);
      throw new AppError('Не вдалося зберегти refresh token', 500);
    }
  }

  // Видалення refresh token
  async removeRefreshToken(userId, refreshToken) {
    try {
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new AppError('Користувача не знайдено', 404);
      }

      const updatedTokens = user.refreshTokens.filter(tokenObj => 
        tokenObj.token !== refreshToken
      );

      const updatedUser = await UserRepository.updateRefreshTokens(userId, updatedTokens);
      
      // Видаляємо з кешу
      const cacheKey = `refresh_token:${userId}:${refreshToken}`;
      await this.cacheDel(cacheKey);
      
      logger.info(`Видалено refresh token для користувача ${userId}`);
      return updatedUser;

    } catch (error) {
      logger.error(`Помилка видалення refresh token: ${error.message}`);
      throw new AppError('Не вдалося видалити refresh token', 500);
    }
  }

  // Пошук refresh token з кешуванням
  async findRefreshToken(userId, refreshToken) {
    try {
      // Спочатку перевіряємо кеш
      const cacheKey = `refresh_token:${userId}:${refreshToken}`;
      let tokenObj = await this.cacheGet(cacheKey);
      
      if (tokenObj) {
        // Перевіряємо термін дії
        if (new Date(tokenObj.expiresAt) > new Date()) {
          return tokenObj;
        } else {
          // Видаляємо прострочений токен з кешу
          await this.cacheDel(cacheKey);
        }
      }

      // Якщо немає в кеші, шукаємо в базі
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new AppError('Користувача не знайдено', 404);
      }

      tokenObj = user.refreshTokens.find(tokenObj => 
        tokenObj.token === refreshToken && tokenObj.expiresAt > new Date()
      );

      // Кешуємо результат, якщо знайдено
      if (tokenObj) {
        await this.cacheSet(cacheKey, tokenObj, 7 * 24 * 60 * 60); // 7 днів
      }

      return tokenObj || null;

    } catch (error) {
      logger.error(`Помилка пошуку refresh token: ${error.message}`);
      throw new AppError('Не вдалося знайти refresh token', 500);
    }
  }

  // Генерація токена для скидання пароля
  generateResetToken() {
    try {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      const token = jwt.sign(
        { resetToken: hashedToken },
        this.resetSecret,
        { expiresIn: this.resetExpiresIn, algorithm: 'HS256' }
      );

      return { resetToken, hashedToken, token };
    } catch (error) {
      logger.error(`Помилка генерації reset token: ${error.message}`);
      throw new AppError('Не вдалося згенерувати токен скидання пароля', 500);
    }
  }

  // Валідація токена скидання пароля
  validateResetToken(token) {
    try {
      return jwt.verify(token, this.resetSecret);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Токен скидання пароля прострочений', 400);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Недійсний токен скидання пароля', 400);
      }
      logger.error(`Помилка валідації reset token: ${error.message}`);
      throw new AppError('Помилка валідації токена скидання пароля', 400);
    }
  }

  // Інвалідація всіх токенів користувача
  async invalidateAllTokens(userId) {
    try {
      const updatedUser = await UserRepository.updateRefreshTokens(userId, []);
      
      // Інвалідація всіх кешованих токенів для користувача
      if (this.redisClient) {
        try {
          const keys = await this.redisClient.keys(`refresh_token:${userId}:*`);
          if (keys.length > 0) {
            await this.redisClient.del(keys);
          }
        } catch (error) {
          logger.warn('Помилка інвалідації кешу токенів:', error.message);
        }
      } else {
        // Для in-memory кешу видаляємо всі токени користувача
        for (const key of this.memoryCache.keys()) {
          if (key.startsWith(`refresh_token:${userId}:`)) {
            this.memoryCache.delete(key);
          }
        }
      }
      
      logger.info(`Інвалідовано всі токени для користувача ${userId}`);
      return updatedUser;
    } catch (error) {
      logger.error(`Помилка інвалідації токенів: ${error.message}`);
      throw new AppError('Не вдалося інвалідувати токени', 500);
    }
  }

  // Очищення ресурсів
  async cleanup() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        logger.warn('Помилка закриття Redis з\'єднання:', error.message);
      }
    }
  }
}

module.exports = new TokenService();