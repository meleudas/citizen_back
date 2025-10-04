// middleware/validation.middleware.js

const { validationResult } = require('express-validator');
const { AppError, ValidationError } = require('../utils/errors');
const logger = require('../../config/logger');

// Middleware для обробки результатів валідації express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  // Додаткове логування отриманих даних для дебагу
  logger.info('=== ВХІДНІ ДАНІ ДЛЯ ВАЛІДАЦІЇ ===', {
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    }
  });
  
  if (!errors.isEmpty()) {
    // Форматування помилок
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      location: error.location,
      value: error.value
    }));
    
    logger.warn('Помилка валідації уєбан', { 
      url: req.originalUrl,
      method: req.method,
      errors: formattedErrors,
      userId: req.user?.id,
      requestBody: req.body // Додаткове логування тіла запиту
    });
    
    const error = new ValidationError('Помилка валідації чорт', formattedErrors);
    return res.status(400).json({
      success: false,
      message: error.message,
      details: error.details
    });
  }
  
  next();
};

// Middleware для валідації обов'язкових полів
const validateRequiredFields = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    // Логування для дебагу
    logger.debug('Валідація обов\'язкових полів', {
      requiredFields,
      requestBody: req.body
    });
    
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      const error = new ValidationError(
        `Відсутні обов'язкові поля: ${missingFields.join(', ')}`
      );
      
      logger.warn('Відсутні обов\'язкові поля', { 
        url: req.originalUrl,
        method: req.method,
        missingFields,
        requestBody: req.body,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    next();
  };
};

// Middleware для валідації типів даних
const validateDataTypes = (schema) => {
  return (req, res, next) => {
    const errors = [];
    
    // Логування для дебагу
    logger.debug('Валідація типів даних', {
      schema,
      requestBody: req.body
    });
    
    for (const [field, type] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Логування кожного поля для дебагу
      logger.debug(`Валідація поля ${field}`, {
        value,
        type: typeof value,
        expectedType: type
      });
      
      if (value !== undefined && value !== null) {
        switch (type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Поле ${field} має бути рядком`);
            }
            break;
          case 'number':
            if (typeof value !== 'number' && isNaN(Number(value))) {
              errors.push(`Поле ${field} має бути числом`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
              errors.push(`Поле ${field} має бути булевим значенням`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`Поле ${field} має бути масивом`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || Array.isArray(value) || value === null) {
              errors.push(`Поле ${field} має бути об'єктом`);
            }
            break;
          case 'date':
            if (isNaN(Date.parse(value))) {
              errors.push(`Поле ${field} має бути датою`);
            }
            break;
          case 'email':
            const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
            if (typeof value !== 'string' || !emailRegex.test(value)) {
              errors.push(`Поле ${field} має бути коректним email`);
            }
            break;
        }
      }
    }
    
    if (errors.length > 0) {
      const error = new ValidationError(`Помилка валідації типів: ${errors.join(', ')}`);
      
      logger.warn('Помилка валідації типів', { 
        url: req.originalUrl,
        method: req.method,
        errors,
        requestBody: req.body,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    next();
  };
};

// Middleware для валідації довжини рядків
const validateStringLength = (field, minLength, maxLength) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    // Логування для дебагу
    logger.debug(`Валідація довжини рядка для поля ${field}`, {
      value,
      length: value ? value.length : 0,
      minLength,
      maxLength
    });
    
    if (value !== undefined && typeof value === 'string') {
      if (minLength !== undefined && value.length < minLength) {
        const error = new ValidationError(`Поле ${field} має містити принаймні ${minLength} символів`);
        
        logger.warn('Помилка валідації мінімальної довжини', { 
          field,
          value: value.length,
          minLength,
          actualValue: value,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (maxLength !== undefined && value.length > maxLength) {
        const error = new ValidationError(`Поле ${field} не може перевищувати ${maxLength} символів`);
        
        logger.warn('Помилка валідації максимальної довжини', { 
          field,
          value: value.length,
          maxLength,
          actualValue: value,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
    
    next();
  };
};

// Middleware для валідації числових діапазонів
const validateNumberRange = (field, min, max) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    // Логування для дебагу
    logger.debug(`Валідація числового діапазону для поля ${field}`, {
      value,
      type: typeof value
    });
    
    if (value !== undefined) {
      const numValue = Number(value);
      
      if (isNaN(numValue)) {
        const error = new ValidationError(`Поле ${field} має бути числом`);
        
        logger.warn('Помилка валідації числового поля', { 
          field,
          value,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (min !== undefined && numValue < min) {
        const error = new ValidationError(`Поле ${field} має бути не менше ${min}`);
        
        logger.warn('Помилка валідації мінімального значення', { 
          field,
          value: numValue,
          min,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (max !== undefined && numValue > max) {
        const error = new ValidationError(`Поле ${field} має бути не більше ${max}`);
        
        logger.warn('Помилка валідації максимального значення', { 
          field,
          value: numValue,
          max,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
    
    next();
  };
};

// Middleware для валідації enum значень
const validateEnum = (field, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    // Логування для дебагу
    logger.debug(`Валідація enum для поля ${field}`, {
      value,
      allowedValues
    });
    
    if (value !== undefined && !allowedValues.includes(value)) {
      const error = new ValidationError(`Поле ${field} має бути одним з: ${allowedValues.join(', ')}`);
      
      logger.warn('Помилка валідації enum значення', { 
        field,
        value,
        allowedValues,
        userId: req.user?.id
      });
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    next();
  };
};

// Middleware для валідації ObjectId
const validateObjectId = (field) => {
  return (req, res, next) => {
    const value = req.body[field] || req.params[field] || req.query[field];
    
    // Логування для дебагу
    logger.debug(`Валідація ObjectId для поля ${field}`, {
      value
    });
    
    if (value !== undefined) {
      const objectIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!objectIdRegex.test(value)) {
        const error = new ValidationError(`Поле ${field} має бути коректним ObjectId`);
        
        logger.warn('Помилка валідації ObjectId', { 
          field,
          value,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
    
    next();
  };
};

// Middleware для валідації URL
const validateUrl = (field) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    // Логування для дебагу
    logger.debug(`Валідація URL для поля ${field}`, {
      value
    });
    
    if (value !== undefined) {
      try {
        new URL(value);
      } catch (error) {
        const errorObj = new ValidationError(`Поле ${field} має бути коректним URL`);
        
        logger.warn('Помилка валідації URL', { 
          field,
          value,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: errorObj.message
        });
      }
    }
    
    next();
  };
};

// Middleware для валідації Base64
const validateBase64 = (field) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    // Логування для дебагу
    logger.debug(`Валідація Base64 для поля ${field}`, {
      value: value ? value.substring(0, 50) + '...' : null // Обмежуємо довжину для логування
    });
    
    if (value !== undefined) {
      const base64Regex = /^data:image\/[a-zA-Z]+;base64,/;
      if (!base64Regex.test(value)) {
        const error = new ValidationError(`Поле ${field} має бути коректним Base64 зображенням`);
        
        logger.warn('Помилка валідації Base64', { 
          field,
          userId: req.user?.id
        });
        
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
    
    next();
  };
};

// Експорт усіх валідаційних middleware
module.exports = {
  handleValidationErrors,
  validateRequiredFields,
  validateDataTypes,
  validateStringLength,
  validateNumberRange,
  validateEnum,
  validateObjectId,
  validateUrl,
  validateBase64
};