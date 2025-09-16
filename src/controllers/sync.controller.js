// controllers/sync.controller.js (повністю оновлена версія)

const SyncService = require('../services/sync.service');
const { 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  SyncError,
  PartialSyncError
} = require('../utils/errors');
const logger = require('../../config/logger');

class SyncController {
  // Завантаження офлайн даних
  async upload(req, res, next) {
    try {
      const userId = req.user.id;
      const violationsData = req.body;

      // Валідація даних
      if (!violationsData) {
        throw new ValidationError('Дані для синхронізації не надано');
      }

      if (!Array.isArray(violationsData)) {
        throw new ValidationError('Дані мають бути масивом');
      }

      // Виклик сервісу завантаження
      const result = await SyncService.uploadLocalViolations(violationsData, userId);

      // Відповідь
      const statusCode = result.success ? 201 : 207; // 201 Created або 207 Multi-Status
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error(`Помилка завантаження офлайн даних: ${error.message}`, { 
        userId: req.user?.id,
        violationsCount: Array.isArray(req.body) ? req.body.length : 0,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError || error instanceof SyncError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          details: error.details
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Отримання несинхронізованих правопорушень
  async getPending(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit, offset } = req.query;

      // Виклик сервісу отримання
      const result = await SyncService.getUnsyncedViolations(userId);

      // Додаткова пагінація на клієнті, якщо потрібно
      if (limit || offset) {
        const limitNum = parseInt(limit) || result.data.length;
        const offsetNum = parseInt(offset) || 0;
        result.data = result.data.slice(offsetNum, offsetNum + limitNum);
      }

      // Відповідь
      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка отримання несинхронізованих даних: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Отримання статусу синхронізації
  async getStatus(req, res, next) {
    try {
      const userId = req.user.id;

      // Виклик сервісу отримання статусу
      const result = await SyncService.getSyncStatus(userId);

      // Відповідь
      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка отримання статусу синхронізації: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Маскова синхронізація
  async bulkSync(req, res, next) {
    try {
      const userId = req.user.id;
      const violationsData = req.body;

      // Валідація даних
      if (!violationsData) {
        throw new ValidationError('Дані для масової синхронізації не надано');
      }

      if (!Array.isArray(violationsData)) {
        throw new ValidationError('Дані мають бути масивом');
      }

      // Для великих обсягів даних можна використовувати потокову відповідь
      if (violationsData.length > 100) {
        // Відправляємо початковий відповідь
        res.status(202).json({
          success: true,
          message: 'Масова синхронізація прийнята для обробки',
          totalCount: violationsData.length,
          estimatedTime: Math.ceil(violationsData.length / 10) // Приблизний час в секундах
        });

        // Асинхронна обробка
        setImmediate(async () => {
          try {
            await SyncService.bulkSync(violationsData, userId);
            logger.info(`Асинхронна масова синхронізація завершена для користувача ${userId}`);
          } catch (error) {
            logger.error(`Помилка асинхронної масової синхронізації: ${error.message}`, {
              userId,
              error: error.message
            });
          }
        });

        return;
      }

      // Для менших обсягів - синхронна обробка
      const result = await SyncService.bulkSync(violationsData, userId);

      // Відповідь
      const statusCode = result.success ? 200 : 207; // 200 OK або 207 Multi-Status
      res.status(statusCode).json(result);

    } catch (error) {
      logger.error(`Помилка масової синхронізації: ${error.message}`, { 
        userId: req.user?.id,
        violationsCount: Array.isArray(req.body) ? req.body.length : 0,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError || error instanceof SyncError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          details: error.details
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Очищення синхронізованих даних
  async cleanup(req, res, next) {
    try {
      const userId = req.user.id;
      const { olderThanDays } = req.query;

      const days = olderThanDays ? parseInt(olderThanDays) : 30;

      // Виклик сервісу очищення
      const result = await SyncService.cleanupSynced(userId, days);

      // Відповідь
      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка очищення синхронізованих даних: ${error.message}`, { 
        userId: req.user?.id,
        olderThanDays: req.query.olderThanDays,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Оновлення статусу синхронізації
  async updateStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const { violationId, status } = req.body;

      if (!violationId) {
        throw new ValidationError('ID правопорушення не надано');
      }

      if (typeof status !== 'boolean') {
        throw new ValidationError('Статус має бути булевим значенням');
      }

      // Виклик сервісу оновлення статусу
      const result = await SyncService.updateSyncStatus(violationId, userId, status);

      // Відповідь
      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка оновлення статусу синхронізації: ${error.message}`, { 
        userId: req.user?.id,
        violationId: req.body.violationId,
        status: req.body.status,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Отримання детального звіту про синхронізацію
  async getReport(req, res, next) {
    try {
      const userId = req.user.id;
      const { period, limit } = req.query;

      const options = {};
      if (period) options.period = period;
      if (limit) options.limit = parseInt(limit);

      // Виклик сервісу отримання звіту
      const result = await SyncService.getSyncReport(userId, options);

      // Відповідь
      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка отримання звіту синхронізації: ${error.message}`, { 
        userId: req.user?.id,
        options: req.query,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Прогрес синхронізації
  async getProgress(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Виклик сервісу отримання прогресу
      const result = await SyncService.getSyncProgress(userId);

      res.status(200).json(result);

    } catch (error) {
      logger.error(`Помилка отримання прогресу синхронізації: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Синхронізація одного правопорушення
  async syncSingle(req, res, next) {
    try {
      const userId = req.user.id;
      const violationData = req.body;

      if (!violationData) {
        throw new ValidationError('Дані правопорушення не надано');
      }

      // Використовуємо існуючий сервіс для синхронізації одного елемента
      const violationsService = require('../services/violations.service');
      const result = await violationsService.syncLocalViolation(violationData, userId);

      res.status(201).json({
        success: true,
        message: 'Правопорушення успішно синхронізовано',
         result
      });

    } catch (error) {
      logger.error(`Помилка синхронізації одного правопорушення: ${error.message}`, { 
        userId: req.user?.id,
        violationData: req.body,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Синхронізація за діапазоном дат
  async syncByDateRange(req, res, next) {
    try {
      const userId = req.user.id;
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        throw new ValidationError('Початкова та кінцева дата є обов\'язковими');
      }

      // Валідація дат
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new ValidationError('Невірний формат дат');
      }

      if (start > end) {
        throw new ValidationError('Початкова дата не може бути пізнішою за кінцеву');
      }

      // Отримання несинхронізованих правопорушень за діапазоном дат
      const violations = await require('../repositories/violation.repository').findUnsynced(userId);
      
      // Фільтрація за діапазоном дат
      const filteredViolations = violations.filter(v => {
        const violationDate = new Date(v.dateTime);
        return violationDate >= start && violationDate <= end;
      });

      if (filteredViolations.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Немає правопорушень для синхронізації в заданому діапазоні',
          count: 0
        });
      }

      // Синхронізація відфільтрованих правопорушень
      const syncResults = [];
      const errors = [];

      for (const violation of filteredViolations) {
        try {
          const result = await require('../services/violations.service').syncLocalViolation(
            violation.toObject(), 
            userId
          );
          syncResults.push(result);
        } catch (syncError) {
          errors.push({
            violationId: violation._id,
            error: syncError.message
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Синхронізовано ${syncResults.length} з ${filteredViolations.length} правопорушень`,
        data: {
          synced: syncResults,
          errors: errors,
          totalCount: filteredViolations.length,
          syncedCount: syncResults.length,
          errorCount: errors.length
        }
      });

    } catch (error) {
      logger.error(`Помилка синхронізації за діапазоном дат: ${error.message}`, { 
        userId: req.user?.id,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }
}

module.exports = new SyncController();