// middleware/upload.middleware.js

const multer = require('multer');
const { AppError, UploadError } = require('../utils/errors');
const logger = require('../../config/logger');
const path = require('path');

// Налаштування сховища для multer
const storage = multer.memoryStorage();

// Фільтр файлів для зображень
const imageFileFilter = (req, file, cb) => {
  // Дозволені MIME типи
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new UploadError(`Непідтримуваний тип файлу: ${file.mimetype}. Дозволені: JPEG, PNG, GIF, WebP`), false);
  }
};

// Налаштування multer
const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1 // Максимум 1 файл за раз
  }
});

// Middleware для обробки одного зображення
const uploadSingleImage = upload.single('image');

// Middleware для обробки кількох зображень
const uploadMultipleImages = (maxCount = 5) => {
  return upload.array('images', maxCount);
};

// Middleware для обробки зображень з полів форми
const uploadImageFields = (fields) => {
  return upload.fields(fields);
};

// Middleware для валідації розміру зображення в пам'яті
const validateImageSize = (maxSize = 10 * 1024 * 1024) => { // 10MB за замовчуванням
  return (req, res, next) => {
    if (req.file) {
      if (req.file.size > maxSize) {
        logger.warn('Завеликий файл', { 
          fileSize: req.file.size,
          maxSize,
          userId: req.user?.id
        });
        
        return next(new UploadError(`Розмір файлу (${(req.file.size / (1024 * 1024)).toFixed(2)}MB) перевищує максимальний дозволений розмір (${(maxSize / (1024 * 1024)).toFixed(2)}MB)`));
      }
    }
    
    if (req.files) {
      // Для масиву файлів
      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          if (file.size > maxSize) {
            logger.warn('Завеликий файл в масиві', { 
              fileSize: file.size,
              maxSize,
              userId: req.user?.id
            });
            
            return next(new UploadError(`Розмір файлу (${(file.size / (1024 * 1024)).toFixed(2)}MB) перевищує максимальний дозволений розмір (${(maxSize / (1024 * 1024)).toFixed(2)}MB)`));
          }
        }
      } else {
        // Для об'єкта з кількома полями
        for (const [fieldName, files] of Object.entries(req.files)) {
          for (const file of files) {
            if (file.size > maxSize) {
              logger.warn('Завеликий файл в полі', { 
                fieldName,
                fileSize: file.size,
                maxSize,
                userId: req.user?.id
              });
              
              return next(new UploadError(`Розмір файлу (${(file.size / (1024 * 1024)).toFixed(2)}MB) перевищує максимальний дозволений розмір (${(maxSize / (1024 * 1024)).toFixed(2)}MB)`));
            }
          }
        }
      }
    }
    
    next();
  };
};

// Middleware для конвертації buffer в Base64
const bufferToBase64 = () => {
  return (req, res, next) => {
    try {
      if (req.file) {
        // Для одного файлу
        const mimeType = req.file.mimetype;
        const base64 = req.file.buffer.toString('base64');
        req.body.photoBase64 = `data:${mimeType};base64,${base64}`;
      }
      
      if (req.files) {
        // Для масиву файлів
        if (Array.isArray(req.files)) {
          req.body.photoBase64Array = req.files.map(file => {
            const mimeType = file.mimetype;
            const base64 = file.buffer.toString('base64');
            return `data:${mimeType};base64,${base64}`;
          });
        } else {
          // Для об'єкта з кількома полями
          req.body.photoBase64Fields = {};
          for (const [fieldName, files] of Object.entries(req.files)) {
            if (files.length === 1) {
              const file = files[0];
              const mimeType = file.mimetype;
              const base64 = file.buffer.toString('base64');
              req.body.photoBase64Fields[fieldName] = `data:${mimeType};base64,${base64}`;
            } else {
              req.body.photoBase64Fields[fieldName] = files.map(file => {
                const mimeType = file.mimetype;
                const base64 = file.buffer.toString('base64');
                return `data:${mimeType};base64,${base64}`;
              });
            }
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Помилка конвертації buffer в Base64', { 
        error: error.message,
        userId: req.user?.id,
        stack: error.stack
      });
      
      next(new UploadError('Помилка обробки завантаженого файлу'));
    }
  };
};

// Middleware для валідації Base64 зображення
const validateBase64Image = (fieldName = 'photoBase64') => {
  return (req, res, next) => {
    const base64Image = req.body[fieldName];
    
    if (base64Image) {
      try {
        // Перевірка формату Base64
        if (!base64Image.startsWith('data:image/')) {
          throw new UploadError('Невірний формат Base64 зображення. Має починатися з "data:image/"');
        }

        // Отримання MIME типу
        const mimeType = base64Image.split(';')[0].split(':')[1];
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (!allowedMimeTypes.includes(mimeType)) {
          throw new UploadError(`Непідтримуваний MIME тип: ${mimeType}`);
        }

        // Отримання даних Base64
        const base64Data = base64Image.split(',')[1];
        if (!base64Data) {
          throw new UploadError('Невірний формат Base64 даних');
        }

        // Приблизна перевірка розміру
        const imageSize = (base64Data.length * 3) / 4;
        if (imageSize > 10 * 1024 * 1024) { // 10MB
          throw new UploadError(`Розмір зображення (${(imageSize / (1024 * 1024)).toFixed(2)}MB) перевищує максимальний дозволений розмір 10MB`);
        }

      } catch (error) {
        if (error instanceof UploadError) {
          logger.warn('Помилка валідації Base64 зображення', { 
            error: error.message,
            userId: req.user?.id
          });
          
          return res.status(400).json({
            success: false,
            message: error.message
          });
        }
        
        logger.error('Несподівана помилка валідації Base64 зображення', { 
          error: error.message,
          userId: req.user?.id,
          stack: error.stack
        });
        
        return next(new UploadError('Помилка валідації зображення'));
      }
    }
    
    next();
  };
};

// Middleware для обробки помилок multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.error('Помилка multer', { 
      error: err.message,
      code: err.code,
      field: err.field,
      userId: req.user?.id,
      stack: err.stack
    });
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Розмір файлу перевищує максимальний дозволений (10MB)'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Перевищено максимальну кількість файлів'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Недозволене поле файлу'
        });
      default:
        return res.status(400).json({
          success: false,
          message: `Помилка завантаження файлу: ${err.message}`
        });
    }
  }
  
  if (err instanceof UploadError) {
    logger.error('Помилка завантаження', { 
      error: err.message,
      userId: req.user?.id,
      stack: err.stack
    });
    
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next(err);
};

// Middleware для очищення завантажених файлів у разі помилки
const cleanupUploadedFiles = () => {
  return (err, req, res, next) => {
    try {
      // Очищення файлів з пам'яті не потрібно, оскільки multer.memoryStorage
      // автоматично очищає пам'ять після використання
      
      if (err) {
        logger.debug('Очищено завантажені файли після помилки', { 
          userId: req.user?.id
        });
      }
    } catch (cleanupError) {
      logger.warn('Помилка очищення завантажених файлів', { 
        error: cleanupError.message,
        userId: req.user?.id
      });
    }
    
    next(err);
  };
};

// Експорт усіх middleware
module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
  uploadImageFields,
  validateImageSize,
  bufferToBase64,
  validateBase64Image,
  handleMulterError,
  cleanupUploadedFiles
};