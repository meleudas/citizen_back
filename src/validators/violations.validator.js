// validators/violations.validator.js (оновлена версія з використанням validation.middleware)

const { body, query, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation.middleware');

// Українськомовні повідомлення помилок
const errorMessages = {
  required: (field) => `${field} є обов'язковим полем`,
  string: (field) => `${field} має бути текстовим рядком`,
  number: (field) => `${field} має бути числом`,
  boolean: (field) => `${field} має бути булевим значенням`,
  array: (field) => `${field} має бути масивом`,
  object: (field) => `${field} має бути об'єктом`,
  minLength: (field, min) => `${field} має містити принаймні ${min} символів`,
  maxLength: (field, max) => `${field} не може перевищувати ${max} символів`,
  min: (field, min) => `${field} має бути не менше ${min}`,
  max: (field, max) => `${field} має бути не більше ${max}`,
  enum: (field, values) => `${field} має бути одним з: ${values.join(', ')}`,
  date: 'Невірний формат дати',
  futureDate: 'Дата не може бути в майбутньому',
  oldDate: 'Дата не може бути старшою за 30 днів',
  coordinates: 'Невірний формат координат',
  longitude: 'Довгота має бути в діапазоні від -180 до 180',
  latitude: 'Широта має бути в діапазоні від -90 до 90',
  base64: 'Невірний формат Base64 зображення',
  fileSize: 'Розмір файлу перевищує 10MB',
  radius: 'Радіус має бути в діапазоні від 100 до 5000 метрів',
  objectId: 'Невірний формат ID'
};

// Допоміжна функція для перевірки Base64 зображення
const isValidBase64Image = (value) => {
  if (!value) return true;
  
  try {
    // Перевірка формату data:image
    if (!value.startsWith('data:image/')) {
      return false;
    }
    
    // Отримання частини з даними
    const base64Data = value.split(',')[1];
    if (!base64Data) return false;
    
    // Перевірка розміру (приблизно)
    const imageSize = (base64Data.length * 3) / 4;
    if (imageSize > 10 * 1024 * 1024) { // 10MB
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

// Валідація створення правопорушення
const createViolationValidation = [
  // Валідація опису
  body('description')
    .trim()
    .escape()
    .notEmpty()
    .withMessage(errorMessages.required('Опис'))
    .isLength({ min: 10, max: 500 })
    .withMessage(errorMessages.minLength('Опис', 10)),

  // Валідація категорії
  body('category')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Категорія'))
    .isIn(['traffic', 'parking' ,'trash', 'environment', 'public_safety', 'infrastructure', 'vandalism', 'noise',  'other'])
    .withMessage(errorMessages.enum('Категорія', ['traffic', 'parking' ,'trash', 'environment', 'public_safety', 'infrastructure', 'vandalism', 'noise',  'other'])),

  // Валідація фото (опціонально)
  body('photoBase64')
    .optional({ nullable: true })
    .custom((value) => {
      if (value && !isValidBase64Image(value)) {
        throw new Error(errorMessages.base64);
      }
      return true;
    }),

  // Валідація дати та часу
  body('dateTime')
    .notEmpty()
    .withMessage(errorMessages.required('Дата та час'))
    .isISO8601()
    .withMessage(errorMessages.date)
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      if (date > now) {
        throw new Error(errorMessages.futureDate);
      }
      
      if (date < thirtyDaysAgo) {
        throw new Error(errorMessages.oldDate);
      }
      
      return true;
    }),

  // Валідація локації
  body('location')
    .notEmpty()
    .withMessage(errorMessages.required('Локація'))
    .isObject()
    .withMessage(errorMessages.object('Локація')),

  body('location.type')
    .equals('Point')
    .withMessage('Тип локації має бути Point'),

  body('location.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Координати мають містити довготу та широту')
    .custom((coordinates) => {
      const [longitude, latitude] = coordinates;
      
      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        throw new Error(errorMessages.coordinates);
      }
      
      if (longitude < -180 || longitude > 180) {
        throw new Error(errorMessages.longitude);
      }
      
      if (latitude < -90 || latitude > 90) {
        throw new Error(errorMessages.latitude);
      }
      
      return true;
    })
];

// Валідація синхронізації правопорушення
const syncViolationValidation = [
  ...createViolationValidation,
  
  // Валідація статусу синхронізації
  body('isSynced')
    .optional()
    .isBoolean()
    .withMessage(errorMessages.boolean('Статус синхронізації')),

  // Валідація Cloudinary Public ID
  body('cloudinaryPublicId')
    .optional({ nullable: true })
    .isString()
    .withMessage(errorMessages.string('Cloudinary Public ID'))
];

// Валідація дати
const dateValidation = [
  query('date')
    .notEmpty()
    .withMessage(errorMessages.required('Дата'))
    .isISO8601()
    .withMessage(errorMessages.date),

  query('userId')
    .notEmpty()
    .withMessage(errorMessages.required('ID користувача'))
    .isMongoId()
    .withMessage(errorMessages.objectId)
];

// Валідація локації
const locationValidation = [
  body('coordinates')
    .notEmpty()
    .withMessage(errorMessages.required('Координати'))
    .isArray({ min: 2, max: 2 })
    .withMessage('Координати мають містити довготу та широту')
    .custom((coordinates) => {
      const [longitude, latitude] = coordinates;
      
      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        throw new Error(errorMessages.coordinates);
      }
      
      if (longitude < -180 || longitude > 180) {
        throw new Error(errorMessages.longitude);
      }
      
      if (latitude < -90 || latitude > 90) {
        throw new Error(errorMessages.latitude);
      }
      
      return true;
    }),

  body('radius')
    .optional()
    .isNumeric()
    .withMessage(errorMessages.number('Радіус'))
    .isInt({ min: 100, max: 5000 })
    .withMessage(errorMessages.radius)
];

// Валідація ID правопорушення
const violationIdValidation = [
  param('id')
    .notEmpty()
    .withMessage(errorMessages.required('ID правопорушення'))
    .isMongoId()
    .withMessage(errorMessages.objectId)
];

// Валідація параметрів пагінації
const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Ліміт має бути числом від 1 до 100')
    .toInt(),

  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Зміщення має бути невід\'ємним числом')
    .toInt(),

  query('sort')
    .optional()
    .isIn(['dateTime', '-dateTime', 'createdAt', '-createdAt'])
    .withMessage('Сортування має бути одним з: dateTime, -dateTime, createdAt, -createdAt')
];

// Валідація періоду для статистики
const statisticsValidation = [
  query('period')
    .optional()
    .isIn(['day', 'week', 'month'])
    .withMessage(errorMessages.enum('Період', ['day', 'week', 'month']))
    .default('month')
];

// Валідація для пошуку за діапазоном дат
const dateRangeValidation = [
  query('startDate')
    .notEmpty()
    .withMessage(errorMessages.required('Початкова дата'))
    .isISO8601()
    .withMessage(errorMessages.date),

  query('endDate')
    .notEmpty()
    .withMessage(errorMessages.required('Кінцева дата'))
    .isISO8601()
    .withMessage(errorMessages.date)
    .custom((value, { req }) => {
      const startDate = new Date(req.query.startDate);
      const endDate = new Date(value);
      
      if (endDate < startDate) {
        throw new Error('Кінцева дата має бути пізнішою за початкову');
      }
      
      return true;
    })
];

// Експорт усіх валідаційних правил та middleware
module.exports = {
  createViolationValidation,
  syncViolationValidation,
  dateValidation,
  locationValidation,
  violationIdValidation,
  paginationValidation,
  statisticsValidation,
  dateRangeValidation,
  validate: handleValidationErrors // Використовуємо middleware з validation.middleware.js
};