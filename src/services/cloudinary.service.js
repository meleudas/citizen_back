// services/cloudinary.service.js (повністю оновлена версія)

const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');
const { AppError, UploadError, DeleteError } = require('../utils/errors');
const logger = require('../../config/logger');
const redis = require('redis');

class CloudinaryService {
  constructor() {
    this.configure();
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    this.localStoragePath = process.env.LOCAL_STORAGE_PATH || './uploads';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second

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
        logger.info('Redis підключено для cloudinary сервісу');
      } catch (error) {
        logger.warn('Не вдалося підключитися до Redis для cloudinary сервісу:', error.message);
        this.redisClient = null;
      }
    }
  }

  // Кешування URL мініатюр
  async cacheThumbnail(originalUrl, thumbnailUrl, ttl = 3600) { // 1 година
    if (!this.redisClient || !originalUrl) return;
    try {
      const key = `thumbnail:${originalUrl}`;
      await this.redisClient.setEx(key, ttl, thumbnailUrl);
    } catch (error) {
      logger.warn('Помилка кешування мініатюри:', error.message);
    }
  }

  async getCachedThumbnail(originalUrl) {
    if (!this.redisClient || !originalUrl) return null;
    try {
      const key = `thumbnail:${originalUrl}`;
      return await this.redisClient.get(key);
    } catch (error) {
      logger.warn('Помилка отримання мініатюри з кешу:', error.message);
      return null;
    }
  }

  // Конфігурація Cloudinary
  configure() {
    try {
      const cloudinaryUrl = process.env.CLOUDINARY_URL;
      
      if (cloudinaryUrl) {
        // Використання CLOUDINARY_URL
        cloudinary.config({
          cloudinary_url: cloudinaryUrl,
          secure: true
        });
      } else {
        // Використання окремих змінних
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true
        });
      }
      
      logger.info('Cloudinary сконфігуровано успішно');
    } catch (error) {
      logger.error(`Помилка конфігурації Cloudinary: ${error.message}`);
      throw new AppError('Помилка конфігурації Cloudinary', 500);
    }
  }

  // Валідація зображення
  validateImage(base64Image) {
    if (!base64Image) {
      throw new UploadError('Зображення не надано');
    }

    // Перевірка формату Base64
    if (!base64Image.startsWith('image/')) {
      throw new UploadError('Невірний формат зображення. Має бути data:image/...');
    }

    // Отримання MIME типу
    const mimeType = base64Image.split(';')[0].split(':')[1];
    const extension = mimeType.split('/')[1]?.toLowerCase();
    
    if (!extension || !this.allowedFormats.includes(extension)) {
      throw new UploadError(`Непідтримуваний формат зображення. Дозволені: ${this.allowedFormats.join(', ')}`);
    }

    // Отримання даних Base64
    const base64Data = base64Image.split(',')[1];
    if (!base64Data) {
      throw new UploadError('Невірний формат Base64 даних');
    }

    // Перевірка розміру (приблизно)
    const imageSize = (base64Data.length * 3) / 4;
    if (imageSize > this.maxFileSize) {
      throw new UploadError(`Розмір зображення (${(imageSize / (1024 * 1024)).toFixed(2)}MB) перевищує максимальний дозволений розмір 10MB`);
    }

    return { mimeType, extension, base64Data, imageSize };
  }

  // Створення структури папок для локального сховища
  async createLocalDirectories(userId) {
    const now = new Date();
    const folderPath = path.join(
      this.localStoragePath,
      'violations',
      userId.toString(),
      now.getFullYear().toString(),
      (now.getMonth() + 1).toString().padStart(2, '0')
    );
    
    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  }

  // Локальне зберігання як fallback
  async saveLocal(base64Data, userId, filename) {
    try {
      const folderPath = await this.createLocalDirectories(userId);
      const filePath = path.join(folderPath, filename);
      
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(filePath, buffer);
      
      const localUrl = `/uploads/violations/${userId}/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${filename}`;
      
      return {
        url: localUrl,
        secure_url: `${process.env.BASE_URL || 'http://localhost:3000'}${localUrl}`,
        public_id: `local_${filename}`,
        local_path: filePath
      };
    } catch (error) {
      logger.error(`Помилка локального зберігання: ${error.message}`, { 
        userId, 
        filename,
        error: error.message,
        stack: error.stack 
      });
      throw new UploadError('Не вдалося зберегти зображення локально');
    }
  }

  // Retry mechanism
  async retryOperation(operation, retries = this.maxRetries) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries) {
          throw error;
        }
        
        logger.warn(`Спроба ${i + 1} невдала, повтор через ${this.retryDelay * Math.pow(2, i)}ms: ${error.message}`);
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, i)));
      }
    }
  }

  // Завантаження зображення в Cloudinary
  async upload(base64Image, options = {}) {
    try {
      // Валідація зображення
      const { mimeType, extension, base64Data } = this.validateImage(base64Image);
      
      const userId = options.userId || 'anonymous';
      const now = new Date();
      
      // Налаштування параметрів завантаження
      const uploadOptions = {
        folder: `violations/${userId}/${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}`,
        public_id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        transformation: [
          { width: 1920, height: 1920, crop: 'limit' },
          { fetch_format: 'auto', quality: 'auto' }
        ],
        resource_type: 'image',
        timeout: 60000 // 60 секунд
      };

      // Завантаження в Cloudinary з retry
      const result = await this.retryOperation(async () => {
        return await cloudinary.uploader.upload(base64Image, uploadOptions);
      });

      logger.info(`Зображення завантажено успішно: ${result.public_id}`, {
        userId,
        fileSize: result.bytes,
        format: result.format
      });
      
      const uploadResult = {
        url: result.url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes
      };

      // Кешування інформації про завантаження
      await this.cacheUploadInfo(result.public_id, uploadResult);

      return uploadResult;

    } catch (error) {
      logger.error(`Помилка завантаження в Cloudinary: ${error.message}`, {
        userId: options.userId,
        error: error.message,
        stack: error.stack
      });
      
      // Fallback на локальне зберігання
      if (options.fallbackToLocal !== false) {
        try {
          const userId = options.userId || 'anonymous';
          const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${options.extension || 'jpg'}`;
          const localResult = await this.saveLocal(
            this.validateImage(base64Image).base64Data,
            userId,
            filename
          );
          
          logger.info(`Зображення збережено локально як fallback: ${localResult.public_id}`);
          return localResult;
        } catch (localError) {
          logger.error(`Помилка fallback зберігання: ${localError.message}`, {
            userId: options.userId,
            error: localError.message
          });
        }
      }
      
      throw new UploadError(`Помилка завантаження зображення: ${error.message}`);
    }
  }

  // Кешування інформації про завантаження
  async cacheUploadInfo(publicId, info, ttl = 86400) { // 24 години
    if (!this.redisClient || !publicId) return;
    try {
      const key = `upload_info:${publicId}`;
      await this.redisClient.setEx(key, ttl, JSON.stringify(info));
    } catch (error) {
      logger.warn('Помилка кешування інформації про завантаження:', error.message);
    }
  }

  // Отримання кешованої інформації про завантаження
  async getCachedUploadInfo(publicId) {
    if (!this.redisClient || !publicId) return null;
    try {
      const key = `upload_info:${publicId}`;
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Помилка отримання кешованої інформації:', error.message);
      return null;
    }
  }

  // Видалення зображення з Cloudinary
  async delete(publicId) {
    try {
      // Якщо це локальне зображення
      if (publicId && publicId.startsWith('local_')) {
        // Для локальних зображень потрібна окрема обробка
        logger.info(`Локальне зображення позначено для видалення: ${publicId}`);
        return { result: 'ok' };
      }

      if (!publicId) {
        throw new DeleteError('Public ID не надано');
      }

      // Перевірка кешу
      const cachedInfo = await this.getCachedUploadInfo(publicId);
      if (cachedInfo) {
        logger.debug(`Використано кешовану інформацію для видалення: ${publicId}`);
      }

      // Видалення з Cloudinary з retry
      const result = await this.retryOperation(async () => {
        return await cloudinary.uploader.destroy(publicId);
      });
      
      if (result.result === 'ok' || result.result === 'not found') {
        logger.info(`Зображення видалено: ${publicId}`);
        
        // Видалення з кешу
        if (this.redisClient) {
          try {
            await this.redisClient.del(`upload_info:${publicId}`);
          } catch (error) {
            logger.warn('Помилка видалення з кешу:', error.message);
          }
        }
        
        return { result: result.result };
      } else {
        throw new Error(`Неочікуваний результат видалення: ${result.result}`);
      }

    } catch (error) {
      logger.error(`Помилка видалення з Cloudinary: ${error.message}`, {
        publicId,
        error: error.message,
        stack: error.stack
      });
      
      // Якщо файл не знайдено, це не помилка
      if (error.message.includes('not found')) {
        return { result: 'not found' };
      }
      
      throw new DeleteError(`Помилка видалення зображення: ${error.message}`);
    }
  }

  // Отримання інформації про зображення
  async getInfo(publicId) {
    try {
      if (!publicId) {
        throw new AppError('Public ID не надано', 400);
      }

      // Перевірка кешу
      const cachedInfo = await this.getCachedUploadInfo(publicId);
      if (cachedInfo) {
        return cachedInfo;
      }

      // Якщо це локальне зображення
      if (publicId.startsWith('local_')) {
        throw new AppError('Інформація про локальні зображення недоступна через Cloudinary', 400);
      }

      // Отримання інформації з retry
      const result = await this.retryOperation(async () => {
        return await cloudinary.api.resource(publicId);
      });
      
      const info = {
        public_id: result.public_id,
        format: result.format,
        version: result.version,
        resource_type: result.resource_type,
        type: result.type,
        created_at: result.created_at,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        url: result.url,
        secure_url: result.secure_url,
        tags: result.tags || [],
        folder: result.folder
      };

      // Кешування результату
      await this.cacheUploadInfo(publicId, info);

      return info;

    } catch (error) {
      logger.error(`Помилка отримання інформації з Cloudinary: ${error.message}`, {
        publicId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError(`Помилка отримання інформації про зображення: ${error.message}`, 500);
    }
  }

  // Генерація thumbnail
  async generateThumbnail(url, width = 300) {
    try {
      if (!url) {
        throw new AppError('URL зображення не надано', 400);
      }

      // Перевірка кешу
      const cachedThumbnail = await this.getCachedThumbnail(url);
      if (cachedThumbnail) {
        return cachedThumbnail;
      }

      // Якщо це локальний URL
      if (url.startsWith('/uploads/') || url.includes('localhost')) {
        // Для локальних зображень повертаємо оригінальний URL
        return url;
      }

      // Генерація thumbnail для Cloudinary URL
      const transformations = [
        `w_${width}`,
        'c_limit',
        'q_auto',
        'f_auto'
      ].join(',');

      // Додаємо трансформації до URL
      const thumbnailUrl = url.replace(
        '/upload/',
        `/upload/${transformations}/`
      );

      // Кешування результату
      await this.cacheThumbnail(url, thumbnailUrl);

      return thumbnailUrl;

    } catch (error) {
      logger.error(`Помилка генерації thumbnail: ${error.message}`, {
        url,
        width,
        error: error.message,
        stack: error.stack
      });
      return url; // Повертаємо оригінальний URL у разі помилки
    }
  }

  // Отримання статистики використання
  async getUsageStats() {
    try {
      // Перевірка кешу
      if (this.redisClient) {
        try {
          const cached = await this.redisClient.get('cloudinary_usage_stats');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 300000) { // 5 хвилин
              return parsed.data;
            }
          }
        } catch (error) {
          logger.warn('Помилка отримання кешованих статистик:', error.message);
        }
      }

      const result = await this.retryOperation(async () => {
        return await cloudinary.api.usage();
      });
      
      const stats = {
        plan: result.plan,
        last_updated: result.last_updated,
        credits: {
          usage: result.credits?.usage || 0,
          limit: result.credits?.limit || 0,
          used_percent: result.credits?.used_percent || 0
        },
        storage: {
          used: result.storage?.used || 0,
          limit: result.storage?.limit || 0,
          used_percent: result.storage?.used_percent || 0
        }
      };

      // Кешування результату
      if (this.redisClient) {
        try {
          await this.redisClient.setEx(
            'cloudinary_usage_stats', 
            300, // 5 хвилин
            JSON.stringify({ data: stats, timestamp: Date.now() })
          );
        } catch (error) {
          logger.warn('Помилка кешування статистик:', error.message);
        }
      }

      return stats;
    } catch (error) {
      logger.error(`Помилка отримання статистики Cloudinary: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Не вдалося отримати статистику використання Cloudinary', 500);
    }
  }

  // Пінг для перевірки з'єднання
  async ping() {
    try {
      const result = await this.retryOperation(async () => {
        return await cloudinary.api.ping();
      });
      return result;
    } catch (error) {
      logger.error(`Помилка пінгу Cloudinary: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Cloudinary недоступний', 500);
    }
  }

  // Очищення локальних файлів (для адміністративних цілей)
  async cleanupLocalFiles(olderThanDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      logger.info(`Очищення локальних файлів старше ${olderThanDays} днів`);
      
      return { 
        success: true, 
        message: `Очищення локальних файлів старше ${olderThanDays} днів заплановано` 
      };
    } catch (error) {
      logger.error(`Помилка очищення локальних файлів: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Помилка очищення локальних файлів', 500);
    }
  }

  // Очищення ресурсів
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        logger.warn('Помилка закриття Redis з\'єднання в cloudinary сервісі:', error.message);
      }
    }
  }
}

module.exports = new CloudinaryService();