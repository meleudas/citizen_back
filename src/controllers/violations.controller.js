const ViolationsService = require('../services/violations.service');
const { 
  createViolationValidation,
  syncViolationValidation,
  dateValidation,
  locationValidation,
  violationIdValidation,
  paginationValidation,
  statisticsValidation,
  dateRangeValidation,
  validate 
} = require('../validators/violations.validator');
const { AppError } = require('../utils/errors');
const logger = require('../../config/logger');

class ViolationsController {
  // Створення правопорушення
  async create(req, res, next) {
    try {
      // ЛОГУВАННЯ ВХІДНИХ ДАНИХ ДЛЯ НАЛАГОДЖЕННЯ
      logger.warn(`=== ВХІДНІ ДАНІ СТВОРЕННЯ ПРАВОПОРУШЕННЯ ===`);
      logger.warn(`User ID: ${req.user.id}`);
      logger.warn(`Content-Type: ${req.get('Content-Type')}`);
      logger.warn(`Body: ${JSON.stringify(req.body, null, 2)}`);
      logger.warn(`Files: ${JSON.stringify(req.files, null, 2)}`);
      logger.warn(`Raw Body Keys: ${Object.keys(req.body)}`);
      
      // Якщо є location - логуємо його тип та вміст
      if (req.body.location) {
        logger.warn(`Location type: ${typeof req.body.location}`);
        logger.warn(`Location value: ${req.body.location}`);
        try { 
          const parsedLocation = typeof req.body.location === 'string' ? JSON.parse(req.body.location) : req.body.location;
          logger.warn(`Parsed Location: ${JSON.stringify(parsedLocation, null, 2)}`);
        } catch (parseError) {
          logger.warn(`Location parse error: ${parseError.message}`);
        }
      }
      logger.warn(`========================================`);

      // Валідація даних
      await Promise.all(createViolationValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const violationData = req.body;

      // ЛОГУВАННЯ ПІСЛЯ ВАЛІДАЦІЇ
      logger.warn(`=== ПІСЛЯ ВАЛІДАЦІЇ ===`);
      logger.warn(`Violation Data: ${JSON.stringify(violationData, null, 2)}`);
      if (violationData.location) {
        logger.warn(`Location after validation: ${JSON.stringify(violationData.location, null, 2)}`);
      }
      logger.warn(`========================`);

      // Виклик сервісу створення
      const violation = await ViolationsService.create(violationData, userId);

      // Логування успішного створення
      logger.info(`Створено правопорушення для користувача ${userId}: ${violation._id}`);

      // Відповідь
      res.status(201).json({
        success: true,
        message: 'Правопорушення успішно створено',
        data: violation
      });

    } catch (error) {
      logger.error(`Помилка створення правопорушення: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      next(error);
    }
  }

  // Отримання правопорушень за датою
  async getByDate(req, res, next) {
    try {
      const userId = req.user.id;
      const { date } = req.query;

      if (!date) {
        throw new AppError('Дата є обов\'язковим параметром', 400);
      }

      // Валідація дати
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new AppError('Невірний формат дати', 400);
      }

      // Виклик сервісу отримання
      const violations = await ViolationsService.getByDate(dateObj, userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: violations,
        count: violations.length
      });

    } catch (error) {
      logger.error(`Помилка отримання правопорушень за датою: ${error.message}`);
      next(error);
    }
  }

  // Отримання дат правопорушень
  async getDates(req, res, next) {
    try {
      const userId = req.user.id;

      // Виклик сервісу отримання дат
      const dates = await ViolationsService.getViolationDates(userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: dates,
        count: dates.length
      });

    } catch (error) {
      logger.error(`Помилка отримання дат правопорушень: ${error.message}`);
      next(error);
    }
  }

  // Отримання правопорушень за локацією
  async getByLocation(req, res, next) {
    try {
      // ЛОГУВАННЯ ВХІДНИХ ДАНИХ
      logger.warn(`=== ВХІДНІ ДАНІ ЛОКАЦІЇ ===`);
      logger.warn(`Body: ${JSON.stringify(req.body, null, 2)}`);
      logger.warn(`==========================`);

      // Валідація даних
      await Promise.all(locationValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const { coordinates, radius } = req.body;

      // Виклик сервісу отримання
      const violations = await ViolationsService.getByLocation(coordinates, radius, userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: violations,
        count: violations.length
      });

    } catch (error) {
      logger.error(`Помилка отримання правопорушень за локацією: ${error.message}`);
      next(error);
    }
  }

  // Видалення правопорушення
  async delete(req, res, next) {
    try {
      // Валідація ID
      await Promise.all(violationIdValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const { id: violationId } = req.params;

      // Виклик сервісу видалення
      const result = await ViolationsService.delete(violationId, userId);

      // Відповідь
      res.status(200).json({
        success: true,
        message: 'Правопорушення успішно видалено'
      });

    } catch (error) {
      logger.error(`Помилка видалення правопорушення: ${error.message}`);
      next(error);
    }
  }

  // Отримання правопорушень з пагінацією

  async getViolations(req, res, next) {
    try {
      logger.info('=== ВХІДНІ ДАНІ ДЛЯ ВАЛІДАЦІЇ ===', {
        method: req.method,
        url: req.url,
        hasUser: !!req.user,
        userId: req.user?.id,
        query: req.query,
        headers: {
          'content-length': req.headers['content-length'],
          'content-type': req.headers['content-type']
        }
      });

      // Валідація параметрів пагінації
      await Promise.all(paginationValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { limit, offset, sort } = req.query;

      const options = {};
      if (limit) options.limit = parseInt(limit);
      if (offset) options.offset = parseInt(offset);
      if (sort) {
        const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
        const sortOrder = sort.startsWith('-') ? -1 : 1;
        options.sort = { [sortField]: sortOrder };
      }

      logger.debug('Параметри запиту:', { options, hasUser: !!req.user });

      let result;
      
      // Якщо користувач авторизований - отримуємо його правопорушення
      // Якщо ні - отримуємо всі правопорушення
      if (req.user) {
        const userId = req.user.id;
        logger.debug(`Виклик getViolations для користувача ${userId}`);
        result = await ViolationsService.getViolations(userId, options);
      } else {
        logger.debug('Виклик getAllViolations для всіх користувачів');
        result = await ViolationsService.getAllViolations(options);
      }

      logger.debug('Отримано результат:', { 
        hasResult: !!result,
        hasViolations: result && Array.isArray(result.violations),
        violationsCount: result && Array.isArray(result.violations) ? result.violations.length : 0
      });

      // Відповідь - ВИПРАВЛЕНО: правильно використовуємо result
      res.status(200).json({
        success: true,
        data: result.violations,  // ВИПРАВЛЕНО: було "violations" замість "result.violations"
        pagination: result.pagination
      });

    } catch (error) {
      logger.error(`Помилка отримання правопорушень: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
      next(error);
    }
  }
  // Синхронізація локального правопорушення
  async syncViolation(req, res, next) {
    try {
      // ЛОГУВАННЯ ВХІДНИХ ДАНИХ
      logger.warn(`=== ВХІДНІ ДАНІ СИНХРОНІЗАЦІЇ ===`);
      logger.warn(`Body: ${JSON.stringify(req.body, null, 2)}`);
      logger.warn(`================================`);

      // Валідація даних
      await Promise.all(syncViolationValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const violationData = req.body;

      // Виклик сервісу синхронізації
      const violation = await ViolationsService.syncLocalViolation(violationData, userId);

      // Відповідь
      res.status(201).json({
        success: true,
        message: 'Правопорушення успішно синхронізовано',
        data: violation
      });

    } catch (error) {
      logger.error(`Помилка синхронізації правопорушення: ${error.message}`);
      next(error);
    }
  }

  // Отримання несинхронізованих правопорушень
  async getUnsynced(req, res, next) {
    try {
      const userId = req.user.id;

      // Виклик сервісу отримання
      const violations = await ViolationsService.getUnsyncedViolations(userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: violations,
        count: violations.length
      });

    } catch (error) {
      logger.error(`Помилка отримання несинхронізованих правопорушень: ${error.message}`);
      next(error);
    }
  }

  // Отримання статистики
  async getStatistics(req, res, next) {
    try {
      // Валідація параметрів
      await Promise.all(statisticsValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const { period } = req.query;

      // Виклик сервісу отримання статистики
      const statistics = await ViolationsService.getStatistics(userId, period);

      // Відповідь
      res.status(200).json({
        success: true,
        data: statistics
      });

    } catch (error) {
      logger.error(`Помилка отримання статистики: ${error.message}`);
      next(error);
    }
  }

  // Отримання правопорушень за діапазоном дат
  async getByDateRange(req, res, next) {
    try {
      // ЛОГУВАННЯ ВХІДНИХ ДАНИХ
      logger.warn(`=== ВХІДНІ ДАНІ ДІАПАЗОНУ ДАТ ===`);
      logger.warn(`Query: ${JSON.stringify(req.query, null, 2)}`);
      logger.warn(`================================`);

      // Валідація параметрів
      await Promise.all(dateRangeValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const userId = req.user.id;
      const { startDate, endDate } = req.query;

      // Виклик репозиторію напряму (якщо потрібно)
      const violations = await require('../repositories/violation.repository').findByDateRange(
        userId,
        new Date(startDate),
        new Date(endDate)
      );

      // Форматування для відповіді
      const formattedViolations = violations.map(violation => ({
        ...violation,
        daysAgo: Math.ceil((Date.now() - new Date(violation.dateTime)) / (1000 * 60 * 60 * 24)),
        thumbnailUrl: violation.photoUrl ? require('../services/cloudinary.service').generateThumbnail(violation.photoUrl) : null
      }));

      // Відповідь
      res.status(200).json({
        success: true,
        data: formattedViolations,
        count: formattedViolations.length
      });

    } catch (error) {
      logger.error(`Помилка отримання правопорушень за діапазоном дат: ${error.message}`);
      next(error);
    }
  }

  // Отримання конкретного правопорушення
  async getById(req, res, next) {
    try {
      // Валідація ID
      await Promise.all(violationIdValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { id: violationId } = req.params;
      
      // Отримуємо userId з req.user якщо користувач авторизований, інакше null
      const userId = req.user ? req.user.id : null;

      // Виклик сервісу
      const violationService = require('../services/violations.service');
      const formattedViolation = await violationService.getById(violationId, userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: formattedViolation
      });

    } catch (error) {
      logger.error(`Помилка отримання правопорушення: ${error.message}`);
      next(error);
    }
  }
}

module.exports = new ViolationsController();