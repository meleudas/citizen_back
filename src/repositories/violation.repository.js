// repositories/violation.repository.js

const Violation = require('../models/Violation');
const { 
  AppError, 
  NotFoundError, 
  ValidationError, 
  DatabaseError 
} = require('../utils/errors');
const logger = require('../../config/logger');
const mongoose = require('mongoose');

class ViolationRepository {
  // Створення нового правопорушення
  async create(violationData) {
    try {
      const violation = new Violation(violationData);
      const savedViolation = await violation.save();
      logger.info(`Створено правопорушення з ID: ${savedViolation._id}`, { 
        violationId: savedViolation._id,
        userId: savedViolation.userId,
        category: savedViolation.category
      });
      return savedViolation;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError('Правопорушення з такими даними вже існує', 409);
      }
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Помилка валідації: ${error.message}`, Object.values(error.errors).map(err => err.message));
      }
      logger.error(`Помилка створення правопорушення: ${error.message}`, { 
        violationData,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося створити правопорушення');
    }
  }

  // Пошук правопорушень за userId з пагінацією та сортуванням
  async findByUserId(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, sort = { dateTime: -1 } } = options;
      
      const violations = await Violation.find({ userId })
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean();
      
      const total = await Violation.countDocuments({ userId });
      
      return {
        violations,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень для користувача ${userId}: ${error.message}`, { 
        userId,
        options,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення');
    }
  }

  // Пошук правопорушень в діапазоні дат
  async findByDateRange(userId, startDate, endDate) {
    try {
      if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
        throw new ValidationError('Невірний формат дат');
      }

      const violations = await Violation.find({
        userId,
        dateTime: {
          $gte: startDate,
          $lte: endDate
        }
      }).sort({ dateTime: -1 }).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень в діапазоні дат: ${error.message}`, { 
        userId,
        startDate,
        endDate,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення за діапазоном дат');
    }
  }

  // Пошук правопорушень за конкретну дату
  async findByDate(userId, date) {
    try {
      if (!(date instanceof Date)) {
        throw new ValidationError('Невірний формат дати');
      }

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const violations = await Violation.find({
        userId,
        dateTime: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }).sort({ dateTime: -1 }).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень за дату: ${error.message}`, { 
        userId,
        date,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення за датою');
    }
  }

  // Пошук правопорушень в радіусі від координат
  async findByLocation(coordinates, radius = 1000) {
    try {
      if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        throw new ValidationError('Невірний формат координат');
      }

      const [longitude, latitude] = coordinates;
      
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new ValidationError('Невірні координати');
      }

      const violations = await Violation.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: radius
          }
        }
      }).limit(100).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень за локацією: ${error.message}`, { 
        coordinates,
        radius,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення за локацією');
    }
  }

  // Пошук несинхронізованих правопорушень
  async findUnsynced(userId) {
    try {
      const violations = await Violation.find({
        userId,
        isSynced: false
      }).sort({ createdAt: 1 }).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку несинхронізованих правопорушень: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати несинхронізовані правопорушення');
    }
  }

  // Оновлення статусу синхронізації
  async updateSyncStatus(id, status) {
    try {
      const violation = await Violation.findByIdAndUpdate(
        id,
        { isSynced: status },
        { new: true, runValidators: true }
      );

      if (!violation) {
        throw new NotFoundError('Правопорушення не знайдено');
      }

      logger.info(`Оновлено статус синхронізації для правопорушення ${id}: ${status}`, { 
        violationId: id,
        status
      });
      return violation;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID правопорушення');
      }
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка оновлення статусу синхронізації: ${error.message}`, { 
        violationId: id,
        status,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити статус синхронізації');
    }
  }

  // Отримання дат правопорушень для календаря
  async getViolationDates(userId) {
    try {
      const dates = await Violation.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        { $project: { date: { $dateToString: { format: '%Y-%m-%d', date: '$dateTime' } } } },
        { $group: { _id: '$date' } },
        { $sort: { _id: -1 } },
        { $project: { _id: 0, date: '$_id' } }
      ]);

      return dates.map(item => item.date);
    } catch (error) {
      logger.error(`Помилка отримання дат правопорушень: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати дати правопорушень');
    }
  }

  // Видалення правопорушення з перевіркою власника
  async deleteById(id, userId) {
    try {
      const violation = await Violation.findOneAndDelete({
        _id: id,
        userId: userId
      });

      if (!violation) {
        throw new NotFoundError('Правопорушення не знайдено або ви не маєте прав на його видалення');
      }

      logger.info(`Видалено правопорушення з ID: ${id}`, { 
        violationId: id,
        userId
      });
      return { message: 'Правопорушення успішно видалено' };
    } catch (error) {
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID правопорушення');
      }
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка видалення правопорушення: ${error.message}`, { 
        violationId: id,
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося видалити правопорушення');
    }
  }

  // Отримання статистики правопорушень
  async getStatistics(userId, period = 'month') {
    try {
      let groupBy;
      let dateFormat;

      switch (period) {
        case 'day':
          groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$dateTime' } };
          dateFormat = '%Y-%m-%d';
          break;
        case 'week':
          groupBy = { 
            $dateToString: { 
              format: '%Y-%U', 
              date: '$dateTime' 
            } 
          };
          dateFormat = '%Y-%U';
          break;
        case 'month':
        default:
          groupBy = { $dateToString: { format: '%Y-%m', date: '$dateTime' } };
          dateFormat = '%Y-%m';
          break;
      }

      const statistics = await Violation.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: groupBy,
            count: { $sum: 1 },
            categories: { $addToSet: '$category' }
          }
        },
        { $sort: { _id: -1 } },
        {
          $project: {
            _id: 0,
            period: '$_id',
            count: 1,
            categories: 1
          }
        }
      ]);

      return statistics;
    } catch (error) {
      logger.error(`Помилка отримання статистики: ${error.message}`, { 
        userId,
        period,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати статистику правопорушень');
    }
  }

async findById(id) {
    try {
      if (!id) {
        throw new ValidationError('ID правопорушення обов\'язковий');
      }

      const violation = await Violation.findOne({
        _id: id
      }).lean();

      return violation;

    } catch (error) {
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID правопорушення');
      }
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання правопорушення: ${error.message}`, { 
        violationId: id,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення');
    }
  }

  async findByIdAndUser(id, userId) {
    try {
      if (!id) {
        throw new ValidationError('ID правопорушення обов\'язковий');
      }
      if (!userId) {
        throw new ValidationError('ID користувача обов\'язковий');
      }

      const violation = await Violation.findOne({
        _id: id,
        userId: userId
      }).lean();

      return violation;

    } catch (error) {
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID правопорушення');
      }
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання правопорушення: ${error.message}`, { 
        violationId: id,
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення');
    }
  }
  // Підрахунок загальної кількості правопорушень користувача
  async countByUser(userId) {
    try {
      const count = await Violation.countDocuments({ userId });
      return count;
    } catch (error) {
      logger.error(`Помилка підрахунку правопорушень: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати кількість правопорушень');
    }
  }

  // Підрахунок синхронізованих правопорушень користувача
  async countSyncedByUser(userId) {
    try {
      const count = await Violation.countDocuments({ userId, isSynced: true });
      return count;
    } catch (error) {
      logger.error(`Помилка підрахунку синхронізованих правопорушень: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати кількість синхронізованих правопорушень');
    }
  }

  // Отримання дати останньої синхронізації
  async getLastSyncDate(userId) {
    try {
      const violation = await Violation.findOne({ userId, isSynced: true })
        .sort({ updatedAt: -1 })
        .select('updatedAt');
      
      return violation ? violation.updatedAt : null;
    } catch (error) {
      logger.error(`Помилка отримання дати останньої синхронізації: ${error.message}`, { 
        userId,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати дату останньої синхронізації');
    }
  }

  // Пошук старих синхронізованих правопорушень
  async findOldSynced(userId, cutoffDate) {
    try {
      const violations = await Violation.find({
        userId,
        isSynced: true,
        createdAt: { $lt: cutoffDate }
      }).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку старих синхронізованих правопорушень: ${error.message}`, { 
        userId,
        cutoffDate,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося знайти старі синхронізовані правопорушення');
    }
  }

  // Пошук правопорушень за категорією
  async findByCategory(userId, category, options = {}) {
    try {
      const { limit = 20, offset = 0, sort = { dateTime: -1 } } = options;
      
      const violations = await Violation.find({ userId, category })
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean();
      
      const total = await Violation.countDocuments({ userId, category });
      
      return {
        violations,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень за категорією: ${error.message}`, { 
        userId,
        category,
        options,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення за категорією');
    }
  }

  // Пошук правопорушень за діапазоном координат
  async findByBoundingBox(userId, bbox) {
    try {
      const [minLon, minLat, maxLon, maxLat] = bbox;
      
      const violations = await Violation.find({
        userId,
        'location.coordinates': {
          $geoWithin: {
            $box: [[minLon, minLat], [maxLon, maxLat]]
          }
        }
      }).lean();

      return violations;
    } catch (error) {
      logger.error(`Помилка пошуку правопорушень в межах: ${error.message}`, { 
        userId,
        bbox,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення в межах');
    }
  }


  async findAll(options = {}) {
    try {
      const { limit = 20, offset = 0, sort = { dateTime: -1 } } = options;
      
      const violations = await Violation.find({})
        .sort(sort)
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean();
      
      const total = await Violation.countDocuments({});
      
      return {
        violations,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Помилка пошуку всіх правопорушень: ${error.message}`, { 
        options,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося отримати правопорушення');
    }
  }

  // Оновлення правопорушення
  async updateById(id, userId, updateData) {
    try {
      const violation = await Violation.findOneAndUpdate(
        { _id: id, userId: userId },
        updateData,
        { new: true, runValidators: true }
      );

      if (!violation) {
        throw new NotFoundError('Правопорушення не знайдено або ви не маєте прав на його оновлення');
      }

      logger.info(`Оновлено правопорушення з ID: ${id}`, { 
        violationId: id,
        userId,
        updateData
      });
      return violation;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new ValidationError('Невірний формат ID правопорушення');
      }
      if (error.name === 'ValidationError') {
        throw new ValidationError(`Помилка валідації: ${error.message}`, Object.values(error.errors).map(err => err.message));
      }
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка оновлення правопорушення: ${error.message}`, { 
        violationId: id,
        userId,
        updateData,
        error: error.message,
        stack: error.stack 
      });
      throw new DatabaseError('Не вдалося оновити правопорушення');
    }
  }
}

module.exports = new ViolationRepository();