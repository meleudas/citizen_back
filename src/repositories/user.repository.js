// repositories/user.repository.js

const User = require('../models/User');
const { 
  AppError, 
  NotFoundError, 
  ValidationError, 
  ConflictError,
  DatabaseError 
} = require('../utils/errors');
const logger = require('../../config/logger');
const redis = require('redis');

class UserRepository {
  constructor() {
    // Ініціалізація Redis для кешування
    this.redisClient = null;
    this.initRedis();
  }

  // Ініціалізація Redis
  async initRedis() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({ url: process.env.REDIS_URL });
        await this.redisClient.connect();
        logger.info('Redis підключено для user.repository');
      } catch (error) {
        logger.warn('Не вдалося підключитися до Redis для user.repository:', error.message);
        this.redisClient = null;
      }
    }
  }

  // Кешування користувача
  async cacheUser(userId, user, ttl = 1800) { // 30 хвилин
    if (!this.redisClient || !userId) return;
    try {
      const key = `user:${userId}`;
      await this.redisClient.setEx(key, ttl, JSON.stringify(user));
    } catch (error) {
      logger.warn('Помилка кешування користувача:', error.message);
    }
  }

  async getCachedUser(userId) {
    if (!this.redisClient || !userId) return null;
    try {
      const key = `user:${userId}`;
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Помилка отримання кешованого користувача:', error.message);
      return null;
    }
  }

  async invalidateUserCache(userId) {
    if (!this.redisClient || !userId) return;
    try {
      const key = `user:${userId}`;
      await this.redisClient.del(key);
    } catch (error) {
      logger.warn('Помилка інвалідації кешу користувача:', error.message);
    }
  }

  // Створення користувача
  async create(userData) {
    try {
      const user = new User(userData);
      const savedUser = await user.save();
      
      // Кешування нового користувача
      await this.cacheUser(savedUser._id.toString(), savedUser.toObject());
      
      logger.info(`Створено користувача: ${savedUser.email}`, { userId: savedUser._id });
      return savedUser;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictError('Користувач з такими даними вже існує');
      }
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Помилка валідації: ${error.message}`, Object.values(error.errors).map(err => err.message));
      }
      logger.error(`Помилка створення користувача: ${error.message}`, { 
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося створити користувача');
    }
  }

  // Пошук користувача за ID
  async findById(id) {
    try {
      if (!id) {
        throw new ValidationError('ID користувача не надано');
      }

      // Перевірка кешу
      let user = await this.getCachedUser(id);
      if (user) {
        logger.debug(`Отримано користувача з кешу: ${id}`);
        return new User(user);
      }

      user = await User.findById(id).select('+password');
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Кешування результату
      await this.cacheUser(id, user.toObject());

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка пошуку користувача за ID: ${error.message}`, { 
        userId: id,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти користувача');
    }
  }

  // Пошук користувача за email
  async findByEmail(email) {
    try {
      if (!email) {
        throw new ValidationError('Email не надано');
      }

      const user = await User.findOne({ email }).select('+password');
      return user;
    } catch (error) {
      logger.error(`Помилка пошуку користувача за email: ${error.message}`, { 
        email,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти користувача');
    }
  }

  // Пошук користувача за refresh token
  async findByRefreshToken(token) {
    try {
      if (!token) {
        throw new ValidationError('Refresh token не надано');
      }

      const user = await User.findOne({ 'refreshTokens.token': token });
      return user;
    } catch (error) {
      logger.error(`Помилка пошуку користувача за refresh token: ${error.message}`, { 
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти користувача');
    }
  }

  // Оновлення refresh tokens
  async updateRefreshTokens(userId, refreshTokens) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { refreshTokens },
        { new: true, runValidators: true }
      );
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Оновлено refresh tokens для користувача: ${userId}`);
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка оновлення refresh tokens: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити refresh tokens');
    }
  }

  // Оновлення дати останнього входу
  async updateLastLogin(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { lastLogin: new Date() },
        { new: true }
      );
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка оновлення дати входу: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити дату входу');
    }
  }


  // Оновлення пароля - КРАЩЕ ВИПРАВЛЕННЯ
  async updatePassword(userId, newPassword) {
    try {
      // Знаходимо користувача
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Встановлюємо новий пароль (він вже захешований)
      user.password = newPassword;
      
      // Зберігаємо без повторного хешування
      const savedUser = await user.save({ validateBeforeSave: false });
      
      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Оновлено пароль для користувача: ${userId}`);
      return savedUser;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка оновлення пароля: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити пароль');
    }
  }

  // Збереження reset token
  async saveResetToken(userId, resetToken, expiresAt) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          resetPasswordToken: resetToken,
          resetPasswordExpires: expiresAt
        },
        { new: true }
      );
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Збережено reset token для користувача: ${userId}`);
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка збереження reset token: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося зберегти reset token');
    }
  }

  // Пошук користувача за reset token
  async findByResetToken(resetToken) {
    try {
      if (!resetToken) {
        throw new ValidationError('Reset token не надано');
      }

      const user = await User.findOne({
        resetPasswordToken: resetToken,
        resetPasswordExpires: { $gt: Date.now() }
      }).select('+password');

      return user;
    } catch (error) {
      logger.error(`Помилка пошуку користувача за reset token: ${error.message}`, { 
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти користувача');
    }
  }

  // Очищення reset token
  async clearResetToken(userId) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        { 
          resetPasswordToken: undefined,
          resetPasswordExpires: undefined
        },
        { new: true }
      );
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Очищено reset token для користувача: ${userId}`);
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка очищення reset token: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося очистити reset token');
    }
  }

  // Отримання всіх користувачів (для адміністрування)
  async findAll(options = {}) {
    try {
      const { limit = 20, offset = 0, sort = { createdAt: -1 }, filter = {} } = options;
      
      const users = await User.find(filter)
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .select('-password');

      const total = await User.countDocuments(filter);

      return {
        users,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Помилка отримання всіх користувачів: ${error.message}`, { 
        options,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати користувачів');
    }
  }

  // Оновлення даних користувача
  async update(userId, updateData) {
    try {
      // Видаляємо поля, які не можна оновлювати через цей метод
      const allowedUpdates = { ...updateData };
      delete allowedUpdates.password;
      delete allowedUpdates.refreshTokens;
      delete allowedUpdates.resetPasswordToken;
      delete allowedUpdates.resetPasswordExpires;

      const user = await User.findByIdAndUpdate(
        userId,
        allowedUpdates,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Оновлено дані користувача: ${userId}`);
      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Помилка валідації: ${error.message}`, Object.values(error.errors).map(err => err.message));
      }
      logger.error(`Помилка оновлення даних користувача: ${error.message}`, { 
        userId,
        updateData,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити дані користувача');
    }
  }

  // Видалення користувача
  async deleteById(userId) {
    try {
      const user = await User.findByIdAndDelete(userId);
      
      if (!user) {
        throw new NotFoundError('Користувача не знайдено');
      }

      // Інвалідація кешу
      await this.invalidateUserCache(userId);
      
      logger.info(`Видалено користувача: ${userId}`);
      return { message: 'Користувача успішно видалено' };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID користувача');
      }
      logger.error(`Помилка видалення користувача: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося видалити користувача');
    }
  }

  // Підрахунок кількості користувачів
  async count(filter = {}) {
    try {
      const count = await User.countDocuments(filter);
      return count;
    } catch (error) {
      logger.error(`Помилка підрахунку користувачів: ${error.message}`, { 
        filter,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати кількість користувачів');
    }
  }

  // Пошук користувачів за критеріями
  async findByCriteria(criteria, options = {}) {
    try {
      const { limit = 20, offset = 0, sort = { createdAt: -1 } } = options;
      
      const users = await User.find(criteria)
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .select('-password');

      const total = await User.countDocuments(criteria);

      return {
        users,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Помилка пошуку користувачів за критеріями: ${error.message}`, { 
        criteria,
        options,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти користувачів');
    }
  }

  // Перевірка існування користувача
  async exists(criteria) {
    try {
      const count = await User.countDocuments(criteria);
      return count > 0;
    } catch (error) {
      logger.error(`Помилка перевірки існування користувача: ${error.message}`, { 
        criteria,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося перевірити існування користувача');
    }
  }

  // Очищення ресурсів
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        logger.warn('Помилка закриття Redis з\'єднання в user.repository:', error.message);
      }
    }
  }
}

module.exports = new UserRepository();