// services/violations.service.js (оновлена версія)

const ViolationRepository = require('../repositories/violation.repository');
const CloudinaryService = require('./cloudinary.service');
const { 
  ViolationDTO, 
  CreateViolationDTO, 
  SyncViolationDTO 
} = require('../dtos/violation.dto');
const { 
  AppError, 
  ValidationError, 
  NotFoundError, 
  UploadError, 
  SyncError 
} = require('../utils/errors');
const logger = require('../../config/logger');
const redis = require('redis');

class ViolationsService {
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
        logger.info('Redis підключено для violations сервісу');
      } catch (error) {
        logger.warn('Не вдалося підключитися до Redis для violations сервісу:', error.message);
        this.redisClient = null;
      }
    }
  }

  // Кешування результатів
  async cacheGet(key) {
    if (!this.redisClient) return null;
    try {
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Помилка отримання з кешу:', error.message);
      return null;
    }
  }

  async cacheSet(key, value, ttl = 300) {
    if (!this.redisClient) return;
    try {
      await this.redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Помилка збереження в кеш:', error.message);
    }
  }

  async cacheDel(key) {
    if (!this.redisClient) return;
    try {
      await this.redisClient.del(key);
    } catch (error) {
      logger.warn('Помилка видалення з кешу:', error.message);
    }
  }

  // Створення правопорушення - ВИПРАВЛЕНО
  async create(violationData, userId) {
    try {
      // Створення та валідація DTO
      const createDTO = new CreateViolationDTO({ ...violationData, userId });
      const validationErrors = createDTO.validate();
      
      if (validationErrors.length > 0) {
        throw new ValidationError(`Помилка валідації ало: ${validationErrors.join(', ')}`, validationErrors);
      }

      const sanitizedData = createDTO.sanitize();

      let photoUrl = null;
      let cloudinaryPublicId = null;

      // Обробка фото, якщо воно є (вже URL, не Base64)
      if (sanitizedData.photoUrl) {
        // Якщо приходить готовий URL, використовуємо його
        photoUrl = sanitizedData.photoUrl;
        // Якщо потрібно отримати public_id з Cloudinary, можна зробити додатковий запит
        // Але для заощадження часу просто використовуємо URL як є
      }

      // Підготовка даних для створення
      const violationToCreate = {
        userId,
        description: sanitizedData.description,
        category: sanitizedData.category,
        dateTime: sanitizedData.dateTime,
        location: sanitizedData.location,
        photoUrl, // Використовуємо готовий URL
        cloudinaryPublicId, // Залишаємо null, бо ми не володіємо фото
        isSynced: true // Нові правопорушення вважаються синхронізованими
      };

      // Створення правопорушення через репозиторій
      const violation = await ViolationRepository.create(violationToCreate);

      // Використання DTO для відповіді
      const violationDTO = ViolationDTO.fromModel(violation);

      // Інвалідація кешу для користувача
      await this.invalidateUserCache(userId);

      logger.info(`Створено правопорушення для користувача ${userId}: ${violation._id}`, { 
        violationId: violation._id,
        category: violation.category,
        dateTime: violation.dateTime
      });
      
      return violationDTO.toJSON();

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка створення правопорушення: ${error.message}`, { 
        userId, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося створити правопорушення', 500);
    }
  }

  // Отримання правопорушень за датою
  async getByDate(date, userId, options = {}) {
    try {
      const violationDate = new Date(date);
      if (isNaN(violationDate.getTime())) {
        throw new ValidationError('Невірний формат дати');
      }

      // Перевірка кешу
      const cacheKey = `violations_by_date:${userId}:${violationDate.toISOString().split('T')[0]}`;
      let cachedResult = await this.cacheGet(cacheKey);
      
      if (cachedResult) {
        logger.debug(`Отримано правопорушення з кешу для дати ${date}`, { userId });
        return cachedResult;
      }

      const violations = await ViolationRepository.findByDate(userId, violationDate);

      // Використання DTO для форматування
      const violationDTOs = ViolationDTO.fromModels(violations);

      // Форматування для клієнтського відображення
      const formattedViolations = violationDTOs.map(dto => {
        const violationObj = dto.toJSON();
        return {
          ...violationObj,
          daysAgo: this.calculateDaysAgo(violationObj.dateTime),
          thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null
        };
      });

      // Сортування за часом (нові першими)
      formattedViolations.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

      // Кешування результату
      await this.cacheSet(cacheKey, formattedViolations, 300); // 5 хвилин

      logger.info(`Отримано ${formattedViolations.length} правопорушень за дату для користувача ${userId}`, { 
        date: violationDate.toISOString(),
        count: formattedViolations.length
      });
      
      return formattedViolations;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання правопорушень за датою: ${error.message}`, { 
        userId, 
        date, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати правопорушення', 500);
    }
  }

  // Отримання дат правопорушень
  async getViolationDates(userId) {
    try {
      // Перевірка кешу
      const cacheKey = `violation_dates:${userId}`;
      let cachedDates = await this.cacheGet(cacheKey);
      
      if (cachedDates) {
        logger.debug(`Отримано дати правопорушень з кешу для користувача ${userId}`);
        return cachedDates;
      }

      const dates = await ViolationRepository.getViolationDates(userId);
      
      // Кешування результату
      await this.cacheSet(cacheKey, dates, 600); // 10 хвилин

      logger.info(`Отримано ${dates.length} дат правопорушень для користувача ${userId}`, { 
        count: dates.length 
      });
      
      return dates;

    } catch (error) {
      logger.error(`Помилка отримання дат правопорушень: ${error.message}`, { 
        userId, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати дати правопорушень', 500);
    }
  }

  // Отримання правопорушень за локацією
  async getByLocation(coordinates, radius = 1000, userId) {
    try {
      if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        throw new ValidationError('Невірний формат координат');
      }

      const [longitude, latitude] = coordinates;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new ValidationError('Невірні координати');
      }

      if (radius <= 0 || radius > 10000) {
        throw new ValidationError('Радіус має бути в діапазоні від 1 до 10000 метрів');
      }

      const violations = await ViolationRepository.findByLocation(coordinates, radius);

      // Фільтрація за користувачем
      const userViolations = violations.filter(v => v.userId.toString() === userId.toString());

      // Використання DTO для форматування
      const violationDTOs = ViolationDTO.fromModels(userViolations);

      // Форматування для карти
      const formattedViolations = violationDTOs.map(dto => {
        const violationObj = dto.toJSON();
        return {
          ...violationObj,
          thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null,
          formattedDate: new Date(violationObj.dateTime).toLocaleDateString('uk-UA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
        };
      });

      logger.info(`Отримано ${formattedViolations.length} правопорушень в радіусі для користувача ${userId}`, { 
        coordinates,
        radius,
        count: formattedViolations.length
      });
      
      return formattedViolations;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання правопорушень за локацією: ${error.message}`, { 
        userId, 
        coordinates, 
        radius,
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати правопорушення за локацією', 500);
    }
  }

  // Синхронізація локального правопорушення - ВИПРАВЛЕНО
  async syncLocalViolation(violationData, userId) {
    try {
      // Створення та валідація DTO
      const syncDTO = new SyncViolationDTO({ ...violationData, userId });
      const validationErrors = syncDTO.validate();
      
      if (validationErrors.length > 0) {
        throw new ValidationError(`Помилка валідації да: ${validationErrors.join(', ')}`, validationErrors);
      }

      const sanitizedData = syncDTO.sanitize();

      let photoUrl = null;
      let cloudinaryPublicId = null;

      // Обробка фото, якщо воно є (вже URL, не Base64)
      if (sanitizedData.photoUrl) {
        // Якщо приходить готовий URL, використовуємо його
        photoUrl = sanitizedData.photoUrl;
        // Якщо потрібно отримати public_id з Cloudinary, можна зробити додатковий запит
      }

      // Підготовка даних для створення
      const violationToCreate = {
        userId,
        description: sanitizedData.description,
        category: sanitizedData.category,
        dateTime: sanitizedData.dateTime,
        location: sanitizedData.location,
        photoUrl, // Використовуємо готовий URL
        cloudinaryPublicId, // Залишаємо null
        isSynced: true, // Позначаємо як синхронізоване
        ...(sanitizedData.createdAt && { createdAt: sanitizedData.createdAt }),
        ...(sanitizedData.updatedAt && { updatedAt: sanitizedData.updatedAt })
      };

      // Створення правопорушення через репозиторій
      const violation = await ViolationRepository.create(violationToCreate);

      // Використання DTO для відповіді
      const violationDTO = ViolationDTO.fromModel(violation);

      // Інвалідація кешу для користувача
      await this.invalidateUserCache(userId);

      logger.info(`Синхронізовано локальне правопорушення для користувача ${userId}: ${violation._id}`, { 
        violationId: violation._id 
      });
      
      return violationDTO.toJSON();

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка синхронізації правопорушення: ${error.message}`, { 
        userId, 
        error: error.message,
        stack: error.stack 
      });
      throw new SyncError('Не вдалося синхронізувати правопорушення');
    }
  }

  // Видалення правопорушення
  async delete(violationId, userId) {
    try {
      // Отримання правопорушення для перевірки власника та отримання public_id фото
      const violation = await ViolationRepository.findByIdAndUser(violationId, userId);
      
      if (!violation) {
        throw new NotFoundError('Правопорушення не знайдено або ви не маєте прав на його видалення');
      }

      // Видалення фото з Cloudinary, якщо воно є
      if (violation.cloudinaryPublicId) {
        try {
          await CloudinaryService.delete(violation.cloudinaryPublicId);
          logger.info(`Видалено фото з Cloudinary: ${violation.cloudinaryPublicId}`, { 
            publicId: violation.cloudinaryPublicId 
          });
        } catch (error) {
          logger.error(`Помилка видалення фото з Cloudinary: ${error.message}`, { 
            publicId: violation.cloudinaryPublicId,
            error: error.message 
          });
          // Не зупиняємо процес видалення через помилку видалення фото
        }
      }

      // Видалення правопорушення з бази даних
      const result = await ViolationRepository.deleteById(violationId, userId);

      // Інвалідація кешу для користувача
      await this.invalidateUserCache(userId);

      logger.info(`Видалено правопорушення ${violationId} для користувача ${userId}`, { 
        violationId, 
        userId 
      });
      
      return result;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка видалення правопорушення: ${error.message}`, { 
        violationId, 
        userId, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося видалити правопорушення', 500);
    }
  }

  // Отримання статистики
  async getStatistics(userId, period = 'month') {
    try {
      const validPeriods = ['day', 'week', 'month'];
      if (!validPeriods.includes(period)) {
        throw new ValidationError(`Невірний період. Дозволені: ${validPeriods.join(', ')}`);
      }

      // Перевірка кешу
      const cacheKey = `statistics:${userId}:${period}`;
      let cachedStats = await this.cacheGet(cacheKey);
      
      if (cachedStats) {
        logger.debug(`Отримано статистику з кешу для користувача ${userId}`);
        return cachedStats;
      }

      const statistics = await ViolationRepository.getStatistics(userId, period);

      // Форматування статистики
      const formattedStats = {
        period: period,
        data: statistics.map(async item => ({
          period: item.period,
          count: item.count,
          categories: item.categories,
          categoryBreakdown: await this.calculateCategoryBreakdown(userId, item.period)
        }))
      };

      // Кешування результату
      await this.cacheSet(cacheKey, formattedStats, 900); // 15 хвилин

      logger.info(`Отримано статистику для користувача ${userId} за період ${period}`, { 
        period, 
        dataPoints: statistics.length 
      });
      
      return formattedStats;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання статистики: ${error.message}`, { 
        userId, 
        period, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати статистику', 500);
    }
  }

  // Отримання правопорушень з пагінацією (для авторизованих користувачів)
  async getViolations(userId, options = {}) {
    try {
      const result = await ViolationRepository.findByUserId(userId, options);
      
      // Використання DTO для форматування
      const violationDTOs = ViolationDTO.fromModels(result.violations);

      // Форматування для клієнта
      const formattedViolations = violationDTOs.map(dto => {
        const violationObj = dto.toListJSON();
        return {
          ...violationObj,
          daysAgo: this.calculateDaysAgo(violationObj.dateTime),
          thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null
        };
      });

      logger.info(`Отримано ${formattedViolations.length} правопорушень для користувача ${userId}`, { 
        userId, 
        count: formattedViolations.length,
        pagination: result.pagination
      });
      
      return {
        violations: formattedViolations,
        pagination: result.pagination
      };

    } catch (error) {
      logger.error(`Помилка отримання правопорушень: ${error.message}`, { 
        userId, 
        options, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати правопорушення', 500);
    }
  }


  // Отримання всіх правопорушень з пагінацією (для всіх користувачів)
  async getAllViolations(options = {}) {
    try {
      logger.debug('Виклик getAllViolations з опціями:', { options });
      
      // Спробуємо отримати всі правопорушення
      const result = await ViolationRepository.findAll(options);
      
      logger.debug('Отримано результат від репозиторію:', { 
        hasResult: !!result,
        hasViolations: result && Array.isArray(result.violations),
        violationsCount: result && Array.isArray(result.violations) ? result.violations.length : 0,
        hasPagination: result && result.pagination
      });
      
      // Перевірка структури результату
      if (!result) {
        throw new Error('Репозиторій повернув порожній результат');
      }
      
      if (!Array.isArray(result.violations)) {
        logger.error('Неправильна структура результату від репозиторію:', { result });
        throw new Error('Репозиторій повернув неправильну структуру даних');
      }
      
      // Використання DTO для форматування
      logger.debug(`Конвертація ${result.violations.length} правопорушень в DTO`);
      const violationDTOs = ViolationDTO.fromModels(result.violations);
      
      logger.debug(`Конвертовано ${violationDTOs.length} DTO об'єктів`);

      // Форматування для клієнта
      const formattedViolations = violationDTOs.map((dto, index) => {
        try {
          const violationObj = dto.toListJSON();
          logger.debug(`Форматування DTO #${index}:`, { 
            hasObj: !!violationObj,
            hasLocation: !!violationObj?.location,
            locationType: typeof violationObj?.location,
            hasCoords: !!(violationObj?.latitude && violationObj?.longitude)
          });
          
          // Логування конкретної локації для налагодження
          if (violationObj?.location) {
            logger.debug(`Location data for violation #${index}:`, violationObj.location);
          }
          
          return {
            ...violationObj,
            daysAgo: violationObj.dateTime ? this.calculateDaysAgo(violationObj.dateTime) : null,
            thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null
          };
        } catch (formatError) {
          logger.error(`Помилка форматування DTO #${index}:`, { 
            error: formatError.message,
            dto: dto
          });
          throw formatError;
        }
      });

      logger.info(`Отримано ${formattedViolations.length} всіх правопорушень`, { 
        count: formattedViolations.length,
        pagination: result.pagination
      });
      
      return {
        violations: formattedViolations,
        pagination: result.pagination
      };

    } catch (error) {
      logger.error(`Помилка отримання всіх правопорушень: ${error.message}`, { 
        options, 
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Додаткове логування для специфічних типів помилок
      if (error instanceof AppError) {
        logger.error('AppError деталі:', { 
          message: error.message,
          statusCode: error.statusCode,
          isOperational: error.isOperational
        });
      }
      
      throw new AppError('Не вдалося отримати правопорушення', 500);
    }
  }
  // Отримання несинхронізованих правопорушень
  async getUnsyncedViolations(userId) {
    try {
      const violations = await ViolationRepository.findUnsynced(userId);
      
      // Використання DTO для форматування
      const violationDTOs = ViolationDTO.fromModels(violations);

      logger.info(`Отримано ${violations.length} несинхронізованих правопорушень для користувача ${userId}`, { 
        userId, 
        count: violations.length 
      });
      
      return violationDTOs.map(dto => dto.toListJSON());

    } catch (error) {
      logger.error(`Помилка отримання несинхронізованих правопорушень: ${error.message}`, { 
        userId, 
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати несинхронізовані правопорушення', 500);
    }
  }

  // Допоміжна функція для розрахунку кількості днів тому
  calculateDaysAgo(dateTime) {
    const now = new Date();
    const violationDate = new Date(dateTime);
    const diffTime = Math.abs(now - violationDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Допоміжна функція для розрахунку розподілу по категоріям
  async calculateCategoryBreakdown(userId, period) {
    try {
      // Цю функцію можна реалізувати для детального аналізу
      // Поки що повертаємо заглушку
      return {};
    } catch (error) {
      logger.warn(`Помилка розрахунку розподілу по категоріям: ${error.message}`, { 
        userId, 
        period 
      });
      return {};
    }
  }

  // Отримання конкретного правопорушення
  async getById(violationId, userId) {
      try {
        // Якщо користувач авторизований - шукаємо з перевіркою прав, інакше - просто по ID
        let violation;
        
        if (userId) {
          // Користувач авторизований - перевіряємо чи має він доступ до цього правопорушення
          violation = await ViolationRepository.findByIdAndUser(violationId, userId);
        } else {
          // Користувач не авторизований - просто отримуємо правопорушення по ID
          violation = await ViolationRepository.findById(violationId);
        }
        
        if (!violation) {
          throw new NotFoundError('Правопорушення не знайдено');
        }

        // Використання DTO для форматування
        const violationDTO = ViolationDTO.fromModel(violation);

        const violationObj = violationDTO.toJSON();
        const formattedViolation = {
          ...violationObj,
          daysAgo: this.calculateDaysAgo(violationObj.dateTime),
          thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null
        };

        return formattedViolation;

      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        logger.error(`Помилка отримання правопорушення: ${error.message}`, { 
          violationId, 
          userId, 
          error: error.message,
          stack: error.stack 
        });
        throw new AppError('Не вдалося отримати правопорушення', 500);
      }
  }

  // Отримання правопорушень за діапазоном дат
  async getByDateRange(startDate, endDate, userId) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new ValidationError('Невірний формат дат');
      }

      const violations = await ViolationRepository.findByDateRange(userId, start, end);

      // Використання DTO для форматування
      const violationDTOs = ViolationDTO.fromModels(violations);

      // Форматування для відповіді
      const formattedViolations = violationDTOs.map(dto => {
        const violationObj = dto.toJSON();
        return {
          ...violationObj,
          daysAgo: this.calculateDaysAgo(violationObj.dateTime),
          thumbnailUrl: violationObj.photoUrl ? CloudinaryService.generateThumbnail(violationObj.photoUrl) : null
        };
      });

      return formattedViolations;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання правопорушень за діапазоном дат: ${error.message}`, { 
        userId, 
        startDate, 
        endDate,
        error: error.message,
        stack: error.stack 
      });
      throw new AppError('Не вдалося отримати правопорушення за діапазоном дат', 500);
    }
  }

  // Інвалідація кешу користувача
  async invalidateUserCache(userId) {
    try {
      if (!this.redisClient) return;

      // Видалення всіх ключів, пов'язаних з користувачем
      const patterns = [
        `violations_by_date:${userId}:*`,
        `violation_dates:${userId}`,
        `statistics:${userId}:*`
      ];

      for (const pattern of patterns) {
        try {
          const keys = await this.redisClient.keys(pattern);
          if (keys.length > 0) {
            await this.redisClient.del(keys);
          }
        } catch (error) {
          logger.warn(`Помилка інвалідації кешу для патерну ${pattern}:`, error.message);
        }
      }

      logger.debug(`Інвалідовано кеш для користувача ${userId}`);
    } catch (error) {
      logger.warn(`Помилка інвалідації кешу користувача ${userId}:`, error.message);
    }
  }

  // Очищення ресурсів
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        logger.warn('Помилка закриття Redis з\'єднання в violations сервісі:', error.message);
      }
    }
  }
}

module.exports = new ViolationsService();