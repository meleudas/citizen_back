// dtos/violation.dto.js

class ViolationDTO {
  constructor(violation) {
    this.id = violation._id || violation.id;
    this.userId = violation.userId;
    this.description = violation.description;
    this.category = violation.category;
    this.photoUrl = violation.photoUrl;
    this.dateTime = violation.dateTime;
    this.location = violation.location;
    this.isSynced = violation.isSynced;
    this.createdAt = violation.createdAt;
    this.updatedAt = violation.updatedAt;
    
    // Віртуальні поля
    if (violation.formattedDate) {
      this.formattedDate = violation.formattedDate;
    }
    if (violation.locationString) {
      this.locationString = violation.locationString;
    }
  }

  // Фабричний метод для створення DTO з моделі
  static fromModel(violation) {
    return new ViolationDTO(violation);
  }

  // Фабричний метод для створення масиву DTO
  static fromModels(violations) {
    if (!Array.isArray(violations)) return [];
    return violations.map(violation => new ViolationDTO(violation));
  }

  // Для публічного відображення (без службових даних)
  toPublicJSON() {
    return {
      id: this.id,
      userId: this.userId,
      description: this.description,
      category: this.category,
      photoUrl: this.photoUrl,
      dateTime: this.dateTime,
      location: this.location,
      isSynced: this.isSynced,
      formattedDate: this.formattedDate,
      locationString: this.locationString
    };
  }

  // Повна інформація
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      description: this.description,
      category: this.category,
      photoUrl: this.photoUrl,
      dateTime: this.dateTime,
      location: this.location,
      isSynced: this.isSynced,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      formattedDate: this.formattedDate,
      locationString: this.locationString
    };
  }

  // Для списку (оптимізоване відображення)
  toListJSON() {
    return {
      id: this.id,
      description: this.description,
      category: this.category,
      photoUrl: this.photoUrl,
      dateTime: this.dateTime,
      isSynced: this.isSynced,
      formattedDate: this.formattedDate
    };
  }
}

// DTO для створення правопорушення
class CreateViolationDTO {
  constructor(data) {
    this.description = data.description;
    this.category = data.category;
    this.photoBase64 = data.photoBase64;
    this.dateTime = data.dateTime;
    this.location = data.location;
  }

  // Валідація даних
  validate() {
    const errors = [];

    if (!this.description || this.description.trim().length === 0) {
      errors.push('Опис є обов\'язковим');
    } else if (this.description.length < 10) {
      errors.push('Опис має містити принаймні 10 символів');
    } else if (this.description.length > 1000) {
      errors.push('Опис не може перевищувати 1000 символів');
    }

    const validCategories = ['traffic', 'environment', 'public_safety', 'infrastructure', 'other'];
    if (!this.category) {
      errors.push('Категорія є обов\'язковою');
    } else if (!validCategories.includes(this.category)) {
      errors.push(`Категорія має бути однією з: ${validCategories.join(', ')}`);
    }

    if (!this.dateTime) {
      errors.push('Дата та час є обов\'язковими');
    } else {
      const date = new Date(this.dateTime);
      if (isNaN(date.getTime())) {
        errors.push('Невірний формат дати');
      } else {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (date > now) {
          errors.push('Дата не може бути в майбутньому');
        }
        if (date < thirtyDaysAgo) {
          errors.push('Дата не може бути старшою за 30 днів');
        }
      }
    }

    if (!this.location) {
      errors.push('Локація є обов\'язковою');
    } else if (!this.location.type || this.location.type !== 'Point') {
      errors.push('Тип локації має бути Point');
    } else if (!Array.isArray(this.location.coordinates) || this.location.coordinates.length !== 2) {
      errors.push('Координати мають містити довготу та широту');
    } else {
      const [longitude, latitude] = this.location.coordinates;
      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        errors.push('Координати мають бути числами');
      } else {
        if (longitude < -180 || longitude > 180) {
          errors.push('Довгота має бути в діапазоні від -180 до 180');
        }
        if (latitude < -90 || latitude > 90) {
          errors.push('Широта має бути в діапазоні від -90 до 90');
        }
      }
    }

    // Валідація фото (якщо надано)
    if (this.photoBase64) {
      if (!this.photoBase64.startsWith('data:image/')) {
        errors.push('Невірний формат зображення');
      } else {
        const base64Data = this.photoBase64.split(',')[1];
        if (base64Data) {
          const imageSize = (base64Data.length * 3) / 4;
          if (imageSize > 10 * 1024 * 1024) { // 10MB
            errors.push('Розмір зображення не може перевищувати 10MB');
          }
        }
      }
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    return {
      description: this.description?.trim(),
      category: this.category,
      photoBase64: this.photoBase64,
      dateTime: new Date(this.dateTime),
      location: {
        type: 'Point',
        coordinates: [
          parseFloat(this.location.coordinates[0]),
          parseFloat(this.location.coordinates[1])
        ]
      }
    };
  }
}

// DTO для синхронізації офлайн даних
class SyncViolationDTO {
  constructor(data) {
    this.id = data.id;
    this.description = data.description;
    this.category = data.category;
    this.photoBase64 = data.photoBase64;
    this.dateTime = data.dateTime;
    this.location = data.location;
    this.isSynced = data.isSynced !== undefined ? data.isSynced : false;
    this.localId = data.localId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // Валідація даних для синхронізації
  validate() {
    const errors = [];

    // Використовуємо ті ж правила, що і для CreateViolationDTO
    const createDTO = new CreateViolationDTO({
      description: this.description,
      category: this.category,
      photoBase64: this.photoBase64,
      dateTime: this.dateTime,
      location: this.location
    });

    const createErrors = createDTO.validate();
    errors.push(...createErrors);

    // Додаткова валідація для синхронізації
    if (this.createdAt && isNaN(new Date(this.createdAt).getTime())) {
      errors.push('Невірний формат дати створення');
    }

    if (this.updatedAt && isNaN(new Date(this.updatedAt).getTime())) {
      errors.push('Невірний формат дати оновлення');
    }

    if (this.isSynced !== undefined && typeof this.isSynced !== 'boolean') {
      errors.push('Статус синхронізації має бути булевим значенням');
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    const createDTO = new CreateViolationDTO({
      description: this.description,
      category: this.category,
      photoBase64: this.photoBase64,
      dateTime: this.dateTime,
      location: this.location
    });

    const sanitized = createDTO.sanitize();

    if (this.localId !== undefined) {
      sanitized.localId = this.localId;
    }

    if (this.createdAt) {
      sanitized.createdAt = new Date(this.createdAt);
    }

    if (this.updatedAt) {
      sanitized.updatedAt = new Date(this.updatedAt);
    }

    sanitized.isSynced = this.isSynced;

    return sanitized;
  }
}

// DTO для оновлення статусу синхронізації
class UpdateSyncStatusDTO {
  constructor(data) {
    this.violationId = data.violationId;
    this.status = data.status;
  }

  // Валідація даних
  validate() {
    const errors = [];

    if (!this.violationId) {
      errors.push('ID правопорушення є обов\'язковим');
    }

    if (this.status === undefined) {
      errors.push('Статус є обов\'язковим');
    } else if (typeof this.status !== 'boolean') {
      errors.push('Статус має бути булевим значенням');
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    return {
      violationId: this.violationId,
      status: Boolean(this.status)
    };
  }
}

// DTO для фільтрації правопорушень
class FilterViolationsDTO {
  constructor(query) {
    this.userId = query.userId;
    this.category = query.category;
    this.startDate = query.startDate;
    this.endDate = query.endDate;
    this.isSynced = query.isSynced;
    this.limit = query.limit ? parseInt(query.limit) : 20;
    this.offset = query.offset ? parseInt(query.offset) : 0;
    this.sort = query.sort || '-dateTime';
  }

  // Валідація фільтрів
  validate() {
    const errors = [];

    if (this.limit < 1 || this.limit > 100) {
      errors.push('Ліміт має бути в діапазоні від 1 до 100');
    }

    if (this.offset < 0) {
      errors.push('Зміщення не може бути від\'ємним');
    }

    const validSorts = ['dateTime', '-dateTime', 'createdAt', '-createdAt'];
    if (!validSorts.includes(this.sort)) {
      errors.push(`Сортування має бути одним з: ${validSorts.join(', ')}`);
    }

    if (this.startDate && isNaN(new Date(this.startDate).getTime())) {
      errors.push('Невірний формат початкової дати');
    }

    if (this.endDate && isNaN(new Date(this.endDate).getTime())) {
      errors.push('Невірний формат кінцевої дати');
    }

    if (this.isSynced !== undefined && typeof this.isSynced !== 'boolean') {
      errors.push('Статус синхронізації має бути булевим значенням');
    }

    return errors;
  }

  // Отримання критеріїв для пошуку
  toQueryCriteria() {
    const criteria = {};

    if (this.userId) {
      criteria.userId = this.userId;
    }

    if (this.category) {
      criteria.category = this.category;
    }

    if (this.startDate || this.endDate) {
      criteria.dateTime = {};
      if (this.startDate) {
        criteria.dateTime.$gte = new Date(this.startDate);
      }
      if (this.endDate) {
        criteria.dateTime.$lte = new Date(this.endDate);
      }
    }

    if (this.isSynced !== undefined) {
      criteria.isSynced = this.isSynced;
    }

    return criteria;
  }

  // Отримання параметрів пагінації
  toPaginationOptions() {
    return {
      limit: Math.min(this.limit, 100),
      offset: Math.max(this.offset, 0),
      sort: this.getSortObject()
    };
  }

  // Отримання об'єкта сортування
  getSortObject() {
    const sortField = this.sort.startsWith('-') ? this.sort.substring(1) : this.sort;
    const sortOrder = this.sort.startsWith('-') ? -1 : 1;
    return { [sortField]: sortOrder };
  }
}

module.exports = {
  ViolationDTO,
  CreateViolationDTO,
  SyncViolationDTO,
  UpdateSyncStatusDTO,
  FilterViolationsDTO
};