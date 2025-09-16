// middleware/cors.middleware.js

const cors = require('cors');

// Налаштування CORS
const corsOptions = {
  // Дозволені джерела
  origin: (origin, callback) => {
    // У production отримуємо з environment змінних
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'https://yourdomain.com'
        ];
    
    // Дозволяємо запити без origin (наприклад, mobile apps, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Недозволене джерело'));
    }
  },
  
  // Дозволяємо credentials (cookies, authorization headers)
  credentials: true,
  
  // Дозволені методи
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  // Дозволені заголовки
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Access-Token',
    'Cache-Control'
  ],
  
  // Заголовки, які клієнт може отримати
  exposedHeaders: [
    'Authorization',
    'X-Total-Count',
    'X-Pagination'
  ],
  
  // Максимальний вік preflight запиту (24 години)
  maxAge: 86400,
  
  // Дозволяємо передачу credentials для всіх джерел
  preflightContinue: false,
  
  // Обробка OPTIONS запитів
  optionsSuccessStatus: 204
};

// CORS для розробки (більш дозвільна політика)
const devCorsOptions = {
  origin: true, // Дозволяє всі джерела в розробці
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Access-Token'
  ]
};

// Вибираємо конфігурацію в залежності від середовища
const getCorsConfig = () => {
  return process.env.NODE_ENV === 'production' ? corsOptions : devCorsOptions;
};

// Middleware для динамічного CORS
const dynamicCors = cors(getCorsConfig());

// Middleware для конкретних маршрутів з різними налаштуваннями
const corsForApi = cors({
  origin: getCorsConfig().origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ]
});

// Middleware для публічних API (більш дозвільний)
const corsForPublicApi = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

module.exports = {
  cors: dynamicCors,
  corsForApi,
  corsForPublicApi,
  corsOptions,
  devCorsOptions
};