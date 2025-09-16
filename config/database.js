// config/database.js
const mongoose = require('mongoose');
const logger = require('./logger');

class Database {
  constructor() {
    this.connection = null;
    this.retryCount = 0;
    this.maxRetries = 10;
    this.baseDelay = 5000; // 5 seconds
  }

  // Опції підключення (без застарілих опцій)
  get connectionOptions() {
    return {
      // ВИДАЛЕНІ ЗАСТАРІЛІ ОПЦІЇ:
      retryWrites: true,
      writeConcern: { w: 'majority' },
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    };
  }

  // Connection string з fallback
  get connectionString() {
    return process.env.MONGODB_URI || 'mongodb://localhost:27017/violations-app';
  }

  // Експоненційний backoff для retry
  getRetryDelay() {
    return this.baseDelay * Math.pow(2, this.retryCount);
  }

  // Підключення до бази даних
  async connect() {
    try {
      this.connection = await mongoose.connect(this.connectionString, this.connectionOptions);
      this.retryCount = 0; // Скидаємо лічильник при успішному підключенні
      logger.info(`Успішно підключено до MongoDB: ${this.connectionString}`);
      return this.connection;
    } catch (error) {
      logger.error(`Помилка підключення до MongoDB: ${error.message}`);
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = this.getRetryDelay();
        logger.info(`Спроба повторного підключення #${this.retryCount} через ${delay/1000} секунд...`);
        
        setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        logger.error('Досягнуто максимальну кількість спроб підключення');
        throw error;
      }
    }
  }

  // Налаштування обробників подій
  setupEventHandlers() {
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose підключено до MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`Mongoose помилка підключення: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose втрачено з\'єднання з MongoDB');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('Mongoose повторно підключено до MongoDB');
    });

    mongoose.connection.on('reconnectFailed', () => {
      logger.error('Mongoose не вдалося повторно підключитися до MongoDB');
    });
  }

  // Graceful shutdown
  async gracefulShutdown() {
    try {
      logger.info('Ініціалізація graceful shutdown для MongoDB...');
      await mongoose.connection.close();
      logger.info('З\'єднання з MongoDB закрито');
    } catch (error) {
      logger.error(`Помилка при закритті з'єднання: ${error.message}`);
    }
  }

  // Налаштування сигналів для graceful shutdown
  setupGracefulShutdown() {
    process.on('SIGINT', () => {
      logger.info('Отримано SIGINT. Закриття з\'єднання з MongoDB...');
      this.gracefulShutdown();
    });

    process.on('SIGTERM', () => {
      logger.info('Отримано SIGTERM. Закриття з\'єднання з MongoDB...');
      this.gracefulShutdown();
    });

    process.on('SIGUSR2', () => {
      logger.info('Отримано SIGUSR2. Закриття з\'єднання з MongoDB...');
      this.gracefulShutdown();
    });
  }

  // Перевірка стану підключення
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  // Отримання статусу підключення
  getConnectionStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      status: states[mongoose.connection.readyState],
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  // Health check для перевірки доступності
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        return {
          status: 'error',
          message: 'Немає з\'єднання з базою даних',
          timestamp: new Date().toISOString()
        };
      }

      // Виконуємо простий запит для перевірки
      await mongoose.connection.db.admin().ping();
      
      return {
        status: 'ok',
        message: 'Підключення до бази даних активне',
        timestamp: new Date().toISOString(),
        connection: this.getConnectionStatus()
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Помилка перевірки здоров\'я: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Ініціалізація бази даних
  async initialize() {
    this.setupEventHandlers();
    this.setupGracefulShutdown();
    await this.connect();
  }
}

// Екземпляр для використання в додатку
const database = new Database();

module.exports = database;