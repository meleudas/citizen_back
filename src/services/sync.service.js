// services/sync.service.js (повністю оновлена версія)

const ViolationRepository = require('../repositories/violation.repository');
const CloudinaryService = require('../services/cloudinary.service');
const ViolationsService = require('../services/violations.service');
const { AppError, SyncError, PartialSyncError } = require('../utils/errors');
const logger = require('../../config/logger');
const redis = require('redis');

class SyncService {
  constructor() {
    // Кеш для статусу синхронізації
    this.redisClient = null;
    this.initRedis();
  }

  // Ініціалізація Redis
  async initRedis() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = redis.createClient({ url: process.env.REDIS_URL });
        await this.redisClient.connect();
        logger.info('Redis підключено для sync сервісу');
      } catch (error) {
        logger.warn('Не вдалося підключитися до Redis для sync сервісу:', error.message);
        this.redisClient = null;
      }
    }
  }

  // Кешування статусу синхронізації
  async cacheSyncStatus(userId, status, ttl = 300) { // 5 хвилин
    if (!this.redisClient) return;
    try {
      const key = `sync_status:${userId}`;
      await this.redisClient.setEx(key, ttl, JSON.stringify({ ...status, timestamp: Date.now() }));
    } catch (error) {
      logger.warn('Помилка кешування статусу синхронізації:', error.message);
    }
  }

  async getCachedSyncStatus(userId) {
    if (!this.redisClient) return null;
    try {
      const key = `sync_status:${userId}`;
      const cached = await this.redisClient.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 300000) { // 5 хвилин
          return parsed;
        }
      }
      return null;
    } catch (error) {
      logger.warn('Помилка отримання кешованого статусу синхронізації:', error.message);
      return null;
    }
  }

  async invalidateSyncCache(userId) {
    if (!this.redisClient) return;
    try {
      const key = `sync_status:${userId}`;
      await this.redisClient.del(key);
    } catch (error) {
      logger.warn('Помилка інвалідації кешу синхронізації:', error.message);
    }
  }

  // Завантаження офлайн даних
  async uploadLocalViolations(violationsData, userId) {
    try {
      if (!Array.isArray(violationsData)) {
        throw new SyncError('Дані мають бути масивом');
      }

      if (violationsData.length === 0) {
        return {
          success: true,
          message: 'Немає даних для синхронізації',
          data: [],
          counts: { total: 0, success: 0, failed: 0 }
        };
      }

      if (violationsData.length > 100) {
        throw new SyncError('Максимальна кількість правопорушень для синхронізації - 100');
      }

      logger.info(`Початок синхронізації ${violationsData.length} правопорушень для користувача ${userId}`);

      const results = {
        success: [],
        failed: [],
        total: violationsData.length
      };

      // Обробка кожного правопорушення послідовно для кращого контролю помилок
      for (const [index, violation] of violationsData.entries()) {
        try {
          // Синхронізація окремого правопорушення
          const syncedViolation = await ViolationsService.syncLocalViolation(violation, userId);
          results.success.push({
            index,
            id: syncedViolation._id,
            originalId: violation.id,
            violation: syncedViolation
          });
        } catch (error) {
          logger.error(`Помилка синхронізації правопорушення ${index}: ${error.message}`, {
            userId,
            violationId: violation.id,
            error: error.message,
            stack: error.stack
          });
          results.failed.push({
            index,
            originalId: violation.id,
            error: error.message
          });
        }
      }

      const successCount = results.success.length;
      const failedCount = results.failed.length;

      // Інвалідація кешу синхронізації
      await this.invalidateSyncCache(userId);

      const result = {
        success: failedCount === 0,
        message: failedCount === 0 
          ? 'Всі правопорушення успішно синхронізовано' 
          : `Синхронізовано ${successCount} з ${results.total} правопорушень`,
        data: results.success.map(item => item.violation),
        counts: {
          total: results.total,
          success: successCount,
          failed: failedCount
        },
        errors: failedCount > 0 ? results.failed : undefined
      };

      logger.info(`Синхронізація завершена для користувача ${userId}: ${successCount} успішно, ${failedCount} невдало`);

      return result;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка завантаження офлайн даних: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new SyncError(`Помилка синхронізації: ${error.message}`);
    }
  }

  // Отримання несинхронізованих правопорушень
  async getUnsyncedViolations(userId) {
    try {
      const violations = await ViolationRepository.findUnsynced(userId);

      // Оптимізація: тільки необхідні поля
      const optimizedViolations = violations.map(violation => ({
        id: violation._id,
        description: violation.description,
        category: violation.category,
        dateTime: violation.dateTime,
        location: violation.location,
        photoUrl: violation.photoUrl,
        createdAt: violation.createdAt,
        updatedAt: violation.updatedAt
      }));

      logger.info(`Отримано ${optimizedViolations.length} несинхронізованих правопорушень для користувача ${userId}`);

      return {
        success: true,
        data: optimizedViolations,
        count: optimizedViolations.length
      };

    } catch (error) {
      logger.error(`Помилка отримання несинхронізованих правопорушень: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося отримати несинхронізовані правопорушення', 500);
    }
  }

  // Отримання статусу синхронізації
  async getSyncStatus(userId) {
    try {
      // Перевірка кешу
      const cached = await this.getCachedSyncStatus(userId);
      if (cached) {
        logger.debug(`Отримано статус синхронізації з кешу для користувача ${userId}`);
        return cached;
      }

      // Агрегація даних
      const total = await ViolationRepository.countByUser(userId);
      const synced = await ViolationRepository.countSyncedByUser(userId);
      const pending = total - synced;
      
      const lastSync = await ViolationRepository.getLastSyncDate(userId);

      const status = {
        success: true,
        data: {
          total,
          synced,
          pending,
          lastSync: lastSync || null,
          syncPercentage: total > 0 ? Math.round((synced / total) * 100) : 100
        }
      };

      // Збереження в кеш
      await this.cacheSyncStatus(userId, status);

      return status;

    } catch (error) {
      logger.error(`Помилка отримання статусу синхронізації: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося отримати статус синхронізації', 500);
    }
  }

  // Маскова синхронізація
  async bulkSync(violationsData, userId) {
    try {
      if (!Array.isArray(violationsData)) {
        throw new SyncError('Дані мають бути масивом');
      }

      if (violationsData.length === 0) {
        return {
          success: true,
          message: 'Немає даних для синхронізації',
          progress: { total: 0, processed: 0, success: 0, failed: 0, percentage: 100 }
        };
      }

      if (violationsData.length > 1000) {
        throw new SyncError('Максимальна кількість правопорушень для масової синхронізації - 1000');
      }

      const batchSize = 10;
      const totalBatches = Math.ceil(violationsData.length / batchSize);
      const results = {
        batches: [],
        total: violationsData.length,
        processed: 0,
        success: 0,
        failed: 0
      };

      logger.info(`Початок масової синхронізації ${violationsData.length} правопорушень в ${totalBatches} пакетах для користувача ${userId}`);

      // Пакетна обробка
      for (let i = 0; i < totalBatches; i++) {
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, violationsData.length);
        const batch = violationsData.slice(startIndex, endIndex);

        logger.info(`Обробка пакету ${i + 1}/${totalBatches} (${batch.length} елементів)`);

        const batchResult = {
          batchNumber: i + 1,
          total: batch.length,
          success: 0,
          failed: 0,
          items: []
        };

        // Обробка елементів в пакеті
        for (const [index, violation] of batch.entries()) {
          try {
            const syncedViolation = await ViolationsService.syncLocalViolation(violation, userId);
            batchResult.success++;
            batchResult.items.push({
              index: startIndex + index,
              status: 'success',
              id: syncedViolation._id,
              violation: syncedViolation
            });
          } catch (error) {
            batchResult.failed++;
            batchResult.items.push({
              index: startIndex + index,
              status: 'failed',
              error: error.message
            });
            logger.error(`Помилка синхронізації елементу ${startIndex + index}: ${error.message}`, {
              userId,
              error: error.message
            });
          }
        }

        results.batches.push(batchResult);
        results.processed += batch.length;
        results.success += batchResult.success;
        results.failed += batchResult.failed;

        // Прогрес
        const progress = Math.round((results.processed / results.total) * 100);
        logger.info(`Прогрес синхронізації: ${progress}% (${results.processed}/${results.total})`);
      }

      const success = results.failed === 0;
      
      // Інвалідація кешу синхронізації
      await this.invalidateSyncCache(userId);

      const result = {
        success,
        message: success 
          ? 'Масова синхронізація успішно завершена' 
          : `Масова синхронізація завершена з помилками: ${results.success} успішно, ${results.failed} невдало`,
        data: results,
        progress: {
          total: results.total,
          processed: results.processed,
          success: results.success,
          failed: results.failed,
          percentage: Math.round((results.processed / results.total) * 100)
        }
      };

      logger.info(`Масова синхронізація завершена для користувача ${userId}: ${results.success} успішно, ${results.failed} невдало`);

      return result;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка масової синхронізації: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new SyncError(`Помилка масової синхронізації: ${error.message}`);
    }
  }

  // Очищення синхронізованих даних
  async cleanupSynced(userId, olderThanDays = 30) {
    try {
      if (olderThanDays < 1 || olderThanDays > 365) {
        throw new AppError('Кількість днів має бути в діапазоні від 1 до 365', 400);
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Знаходимо синхронізовані правопорушення старше вказаного терміну
      const oldSyncedViolations = await ViolationRepository.findOldSynced(userId, cutoffDate);

      if (oldSyncedViolations.length === 0) {
        return {
          success: true,
          message: 'Немає синхронізованих правопорушень для видалення',
          deletedCount: 0
        };
      }

      logger.info(`Знайдено ${oldSyncedViolations.length} синхронізованих правопорушень для видалення`);

      let deletedCount = 0;
      const failedDeletions = [];

      // Видалення по одному для кращої обробки помилок
      for (const violation of oldSyncedViolations) {
        try {
          // Видалення фото з Cloudinary, якщо воно є
          if (violation.cloudinaryPublicId) {
            try {
              await CloudinaryService.delete(violation.cloudinaryPublicId);
              logger.info(`Видалено фото з Cloudinary: ${violation.cloudinaryPublicId}`);
            } catch (photoError) {
              logger.warn(`Помилка видалення фото з Cloudinary: ${photoError.message}`, {
                publicId: violation.cloudinaryPublicId
              });
            }
          }

          // Видалення правопорушення з бази
          await ViolationRepository.deleteById(violation._id, userId);
          deletedCount++;
        } catch (error) {
          logger.error(`Помилка видалення правопорушення ${violation._id}: ${error.message}`, {
            violationId: violation._id,
            userId,
            error: error.message
          });
          failedDeletions.push({
            id: violation._id,
            error: error.message
          });
        }
      }

      const success = failedDeletions.length === 0;
      
      // Інвалідація кешу синхронізації
      await this.invalidateSyncCache(userId);

      const result = {
        success,
        message: success 
          ? `Успішно видалено ${deletedCount} синхронізованих правопорушень` 
          : `Видалено ${deletedCount} правопорушень, ${failedDeletions.length} невдало`,
        deletedCount,
        failed: failedDeletions.length > 0 ? failedDeletions : undefined
      };

      logger.info(`Очищення завершено: ${deletedCount} видалено, ${failedDeletions.length} невдало`);

      return result;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка очищення синхронізованих даних: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError(`Помилка очищення: ${error.message}`, 500);
    }
  }

  // Оновлення статусу синхронізації для конкретного правопорушення
  async updateSyncStatus(violationId, userId, status) {
    try {
      const result = await ViolationRepository.updateSyncStatus(violationId, status);
      
      // Інвалідація кешу синхронізації
      await this.invalidateSyncCache(userId);
      
      logger.info(`Оновлено статус синхронізації для правопорушення ${violationId}: ${status}`);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      logger.error(`Помилка оновлення статусу синхронізації: ${error.message}`, {
        violationId,
        userId,
        status,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося оновити статус синхронізації', 500);
    }
  }

  // Отримання детального звіту про синхронізацію
  async getSyncReport(userId, options = {}) {
    try {
      const { period = 'month', limit = 100 } = options;
      
      // Отримання статистики
      const statistics = await ViolationRepository.getStatistics(userId, period);
      
      // Отримання статусу
      const status = await this.getSyncStatus(userId);
      
      // Отримання несинхронізованих
      const unsynced = await this.getUnsyncedViolations(userId);

      const report = {
        success: true,
        data: {
          status: status.data,
          statistics,
          unsynced: unsynced.data,
          summary: {
            totalViolations: status.data.total,
            syncedViolations: status.data.synced,
            pendingViolations: status.data.pending,
            unsyncedCount: unsynced.count,
            syncPercentage: status.data.syncPercentage
          }
        }
      };

      logger.info(`Згенеровано звіт про синхронізацію для користувача ${userId}`);
      
      return report;

    } catch (error) {
      logger.error(`Помилка генерації звіту синхронізації: ${error.message}`, {
        userId,
        options,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося згенерувати звіт синхронізації', 500);
    }
  }

  // Отримання прогресу синхронізації
  async getSyncProgress(userId) {
    try {
      // Отримання поточного статусу
      const status = await this.getSyncStatus(userId);
      
      return {
        success: true,
        data: {
          progress: status.data.syncPercentage,
          synced: status.data.synced,
          total: status.data.total,
          pending: status.data.pending,
          lastSync: status.data.lastSync
        }
      };

    } catch (error) {
      logger.error(`Помилка отримання прогресу синхронізації: ${error.message}`, {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося отримати прогрес синхронізації', 500);
    }
  }

  // Очищення ресурсів
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        logger.warn('Помилка закриття Redis з\'єднання в sync сервісі:', error.message);
      }
    }
  }
}

// Екземпляр сервісу
const syncService = new SyncService();

module.exports = syncService;