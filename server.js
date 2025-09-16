// server.js (10/10)
require('dotenv').config();

const app = require('./app');
const database = require('./config/database');
const logger = require('./config/logger');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

// Налаштування порту
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Функція для graceful shutdown
const gracefulShutdown = async (server) => {
  logger.info('Отримано сигнал для завершення роботи...');
  
  try {
    // Закриваємо HTTP сервер
    server.close(() => {
      logger.info('Сервер HTTP зупинено');
    });
    
    // Закриваємо з'єднання з базою даних
    if (database && typeof database.gracefulShutdown === 'function') {
      await database.gracefulShutdown();
    }
    
    // Закриваємо з'єднання з Redis (якщо є)
    const tokenService = require('./services/token.service');
    if (tokenService && typeof tokenService.cleanup === 'function') {
      await tokenService.cleanup();
    }
    
    const violationsService = require('./services/violations.service');
    if (violationsService && typeof violationsService.cleanup === 'function') {
      await violationsService.cleanup();
    }
    
    const syncService = require('./services/sync.service');
    if (syncService && typeof syncService.cleanup === 'function') {
      await syncService.cleanup();
    }
    
    const cloudinaryService = require('./services/cloudinary.service');
    if (cloudinaryService && typeof cloudinaryService.cleanup === 'function') {
      await cloudinaryService.cleanup();
    }
    
    const userRepository = require('./repositories/user.repository');
    if (userRepository && typeof userRepository.cleanup === 'function') {
      await userRepository.cleanup();
    }
    
    logger.info('Всі ресурси успішно зупинено');
    process.exit(0);
    
  } catch (error) {
    logger.error('Помилка під час graceful shutdown:', error.message);
    process.exit(1);
  }
};

// Функція для запуску серверу
const startServer = async () => {
  try {
    // Перевірка чи .env зчитаний
    logger.info('Перевірка конфігурації змінних середовища:', {
      nodeEnv: process.env.NODE_ENV || 'not set',
      port: process.env.PORT || 'default: 3000',
      mongodbUri: process.env.MONGODB_URI ? 'set' : 'not set',
      redisUrl: process.env.REDIS_URL ? 'set' : 'not set',
      jwtAccessSecret: process.env.JWT_ACCESS_SECRET ? 'set' : 'not set',
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ? 'set' : 'not set'
    });

    // Перевірка обов'язкових змінних
    if (!process.env.MONGODB_URI) {
      logger.error('КРИТИЧНА ПОМИЛКА: MONGODB_URI не встановлено в .env файлі');
      process.exit(1);
    }

    if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET || !process.env.JWT_RESET_SECRET) {
      logger.error('КРИТИЧНА ПОМИЛКА: JWT секрети не встановлено в .env файлі');
      process.exit(1);
    }

    logger.info('Конфігурація перевірена успішно');

    // Ініціалізація бази даних
    await database.initialize();
    logger.info('База даних успішно підключена');
    
    // Перевірка здоров'я бази даних
    const dbHealth = await database.healthCheck();
    if (dbHealth.status !== 'ok') {
      throw new Error('База даних не доступна');
    }
    
    // Запуск серверу
    const server = app.listen(PORT, HOST, () => {
      logger.info(`🚀 Сервер запущено на http://${HOST}:${PORT}`, {
        pid: process.pid,
        environment: process.env.NODE_ENV || 'development',
        host: HOST,
        port: PORT
      });
      
      // Логування важливих змінних середовища
      logger.info('Серверна конфігурація:', {
        nodeEnv: process.env.NODE_ENV,
        mongodbUri: process.env.MONGODB_URI ? '***' : 'not set',
        redisUrl: process.env.REDIS_URL ? 'set' : 'not set',
        jwtSecret: process.env.JWT_ACCESS_SECRET ? '***' : 'not set',
        cloudinaryUrl: process.env.CLOUDINARY_URL ? '***' : 'not set'
      });
    });
    
    // Обробка помилок серверу
    server.on('error', (error) => {
      logger.error('Помилка серверу:', error.message);
      
      if (error.code === 'EADDRINUSE') {
        logger.error(`Порт ${PORT} вже використовується`);
        process.exit(1);
      }
    });
    
    // Обробка закриття серверу
    server.on('close', () => {
      logger.info('Сервер закрито');
    });
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('Отримано SIGTERM');
      gracefulShutdown(server);
    });
    
    process.on('SIGINT', () => {
      logger.info('Отримано SIGINT');
      gracefulShutdown(server);
    });
    
    process.on('SIGUSR2', () => {
      logger.info('Отримано SIGUSR2');
      gracefulShutdown(server);
    });
    
    // Обробка unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      server.close(() => {
        process.exit(1);
      });
    });
    
    // Обробка uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      server.close(() => {
        process.exit(1);
      });
    });
    
    
  } catch (error) {
    logger.error('Помилка запуску серверу:', error.message, { stack: error.stack });
    process.exit(1);
  }
};

// Кластеризація для production
if (process.env.NODE_ENV === 'production' && cluster.isMaster) {
  logger.info(`Головний процес запущено ${process.pid}`);
  
  // Форкуємо робочі процеси
  for (let i = 0; i < Math.min(numCPUs, 4); i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Робочий процес ${worker.process.pid} завершився з кодом ${code} та сигналом ${signal}`);
    
    // Перезапуск робочого процесу
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.info('Перезапуск робочого процесу...');
      cluster.fork();
    }
  });
  
} else {
  // Запуск серверу в робочому процесі або в development
  startServer();
}

module.exports = { startServer };