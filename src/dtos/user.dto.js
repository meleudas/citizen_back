// dtos/user.dto.js

class UserDTO {
  constructor(user) {
    this.id = user._id || user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.fullName = user.fullName;
    this.email = user.email;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
    this.lastLogin = user.lastLogin;
  }

  // Фабричний метод для створення DTO з моделі
  static fromModel(user) {
    return new UserDTO(user);
  }

  // Фабричний метод для створення масиву DTO
  static fromModels(users) {
    if (!Array.isArray(users)) return [];
    return users.map(user => new UserDTO(user));
  }

  // Приховуємо чутливі дані
  toJSON() {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLogin: this.lastLogin
    };
  }

  // Для публічного відображення (без службової інформації)
  toPublicJSON() {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName,
      email: this.email
    };
  }

  // Для адміністративних цілей
  toAdminJSON() {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLogin: this.lastLogin
    };
  }
}

// DTO для реєстрації
class RegisterUserDTO {
  constructor(data) {
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.email = data.email;
    this.password = data.password;
  }

  // Валідація даних
  validate() {
    const errors = [];

    if (!this.firstName || this.firstName.trim().length === 0) {
      errors.push('Ім\'я є обов\'язковим');
    } else if (this.firstName.length > 50) {
      errors.push('Ім\'я не може перевищувати 50 символів');
    }

    if (!this.lastName || this.lastName.trim().length === 0) {
      errors.push('Прізвище є обов\'язковим');
    } else if (this.lastName.length > 50) {
      errors.push('Прізвище не може перевищувати 50 символів');
    }

    if (!this.email) {
      errors.push('Email є обов\'язковим');
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(this.email)) {
      errors.push('Невірний формат email');
    }

    if (!this.password) {
      errors.push('Пароль є обов\'язковим');
    } else if (this.password.length < 8) {
      errors.push('Пароль має містити принаймні 8 символів');
    } else if (this.password.length > 128) {
      errors.push('Пароль не може перевищувати 128 символів');
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    return {
      firstName: this.firstName?.trim(),
      lastName: this.lastName?.trim(),
      email: this.email?.toLowerCase().trim(),
      password: this.password
    };
  }
}

// DTO для логіну
class LoginUserDTO {
  constructor(data) {
    this.email = data.email;
    this.password = data.password;
  }

  // Валідація даних
  validate() {
    const errors = [];

    if (!this.email) {
      errors.push('Email є обов\'язковим');
    }

    if (!this.password) {
      errors.push('Пароль є обов\'язковим');
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    return {
      email: this.email?.toLowerCase().trim(),
      password: this.password
    };
  }
}

// DTO для оновлення профілю
class UpdateUserDTO {
  constructor(data) {
    this.firstName = data.firstName;
    this.lastName = data.lastName;
  }

  // Валідація даних
  validate() {
    const errors = [];

    if (this.firstName !== undefined) {
      if (this.firstName.trim().length === 0) {
        errors.push('Ім\'я не може бути порожнім');
      } else if (this.firstName.length > 50) {
        errors.push('Ім\'я не може перевищувати 50 символів');
      }
    }

    if (this.lastName !== undefined) {
      if (this.lastName.trim().length === 0) {
        errors.push('Прізвище не може бути порожнім');
      } else if (this.lastName.length > 50) {
        errors.push('Прізвище не може перевищувати 50 символів');
      }
    }

    return errors;
  }

  // Очищення даних
  sanitize() {
    const sanitized = {};
    if (this.firstName !== undefined) {
      sanitized.firstName = this.firstName.trim();
    }
    if (this.lastName !== undefined) {
      sanitized.lastName = this.lastName.trim();
    }
    return sanitized;
  }
}

module.exports = {
  UserDTO,
  RegisterUserDTO,
  LoginUserDTO,
  UpdateUserDTO
};