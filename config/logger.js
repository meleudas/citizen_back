// config/logger.js

const winston = require('winston');
const path = require('path');

// Створення каталогу для логів, якщо його немає
const fs = require('fs');
const logDir = process.env.LOG_DIR || 'logs';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Визначення рівнів логування
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Кольори для різних рівнів
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(colors);

// Формати логів
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Транспорти для різних рівнів
const transports = [
  // Логи в консоль
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),
  
  // Логи помилок у файл
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: format
  }),
  
  // Всі логи у файл
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format: format
  })
];

// Для production можна додати ротацію логів
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'application.log'),
      level: process.env.LOG_LEVEL || 'info',
      format: format,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  );
}

// Створення екземпляра логера
const Logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports
});

// Якщо ми не в production, логуємо також в консоль
if (process.env.NODE_ENV !== 'production') {
  Logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Додаткові методи для зручності
const logger = {
  error: (message, meta) => Logger.error(message, meta),
  warn: (message, meta) => Logger.warn(message, meta),
  info: (message, meta) => Logger.info(message, meta),
  http: (message, meta) => Logger.http(message, meta),
  verbose: (message, meta) => Logger.verbose(message, meta),
  debug: (message, meta) => Logger.debug(message, meta),
  silly: (message, meta) => Logger.silly(message, meta),
  
  // Метод для логування HTTP запитів
  logRequest: (req, res, next) => {
    const startTime = Date.now();
    
    // Логуємо запит
    Logger.http(`Incoming Request: ${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
    
    // Логуємо відповідь
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      Logger.http(`Outgoing Response: ${req.method} ${req.originalUrl} ${res.statusCode}`, {
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length')
      });
    });
    
    next();
  },
  
  // Метод для логування помилок з додатковою інформацією
  logError: (error, context = {}) => {
    Logger.error(error.message, {
      ...context,
      stack: error.stack,
      name: error.name
    });
  }
};

module.exports = logger;