// services/auth.service.js

const bcrypt = require('bcryptjs');
const UserRepository = require('../repositories/user.repository');
const TokenService = require('./token.service');
const { 
  RegisterUserDTO, 
  LoginUserDTO, 
  UpdateUserDTO 
} = require('../dtos/user.dto');
const logger = require('../../config/logger');
const { 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  ConflictError 
} = require('../utils/errors');

class AuthService {
  constructor() {
    this.saltRounds = 12;
  }

  // Реєстрація користувача
  async register(userData) {
  try {
    // Створення та валідація DTO
    const registerDTO = new RegisterUserDTO(userData);
    const validationErrors = registerDTO.validate();
    
    if (validationErrors.length > 0) {
      throw new AppError(`Помилка валідації: ${validationErrors.join(', ')}`, 400);
    }

    const sanitizedData = registerDTO.sanitize();

    // Перевірка чи існує користувач з таким email
    const existingUser = await UserRepository.findByEmail(sanitizedData.email);
    if (existingUser) {
      throw new AppError('Користувач з таким email вже існує', 409);
    }

    // Додаткове логування для тестування
    console.log('=== Registration Debug ===');
    console.log('Original password:', sanitizedData.password);
    console.log('Password length:', sanitizedData.password.length);

    // Хешування пароля
    const hashedPassword = await bcrypt.hash(sanitizedData.password, this.saltRounds);
    
    console.log('Hashed password:', hashedPassword);
    console.log('Hashed password length:', hashedPassword.length);

    // Тестова перевірка одразу після хешування
    const testCompare = await bcrypt.compare(sanitizedData.password, hashedPassword);
    console.log('Test comparison result (immediate):', testCompare);

    // Створення користувача
    const newUser = await UserRepository.create({
      firstName: sanitizedData.firstName,
      lastName: sanitizedData.lastName,
      email: sanitizedData.email,
      password: hashedPassword
    });

    // Генерація токенів
    const { accessToken, refreshToken } = TokenService.generateTokens({
      userId: newUser._id,
      email: newUser.email
    });

    // Збереження refresh token в базі
    await TokenService.saveRefreshToken(newUser._id, refreshToken);

    // Використання DTO для відповіді
    const userDTO = require('../dtos/user.dto').UserDTO.fromModel(newUser);

    logger.info(`Зареєстровано нового користувача: ${newUser.email}`);
    
    return {
      user: userDTO.toJSON(),
      accessToken,
      refreshToken
    };

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`Помилка реєстрації: ${error.message}`);
    throw new AppError('Не вдалося зареєструвати користувача', 500);
  }
}

  // Логін користувача
  async login(email, password) {
    try {
      // Створення та валідація DTO
      const loginDTO = new LoginUserDTO({ email, password });
      const validationErrors = loginDTO.validate();
      
      if (validationErrors.length > 0) {
        throw new ValidationError(`Помилка валідації: ${validationErrors.join(', ')}`, validationErrors);
      }

      const sanitizedData = loginDTO.sanitize();
      console.log('Sanitized login data:', sanitizedData); // Тимчасовий лог

      // Пошук користувача за email
      const user = await UserRepository.findByEmail(sanitizedData.email);
      console.log('User found:', user ? 'Yes' : 'No'); // Тимчасовий лог
      if (user) {
        console.log('User email:', user.email); // Тимчасовий лог
      }

      if (!user) {
        console.log('User not found in database'); // Тимчасовий лог
        throw new AuthenticationError('Невірний email або пароль');
      }

      // Порівняння паролів
      console.log('Comparing passwords...'); // Тимчасовий лог
      const isPasswordValid = await user.comparePassword(sanitizedData.password);
      console.log('Password valid:', isPasswordValid); // Тимчасовий лог

      if (!isPasswordValid) {
        throw new AuthenticationError('Невірний пароль');
      }

      // Генерація токенів
      const { accessToken, refreshToken } = TokenService.generateTokens({
        userId: user._id,
        email: user.email
      });

      // Збереження refresh token в базі
      await TokenService.saveRefreshToken(user._id, refreshToken);

      // Оновлення дати останнього входу (опціонально)
      await UserRepository.updateLastLogin(user._id);

      // Використання DTO для відповіді
      const userDTO = require('../dtos/user.dto').UserDTO.fromModel(user);

      logger.info(`Користувач увійшов: ${user.email}`);
      
      return {
        user: userDTO.toJSON(),
        accessToken,
        refreshToken
      };

    } catch (error) {
      console.log('Login service error:', error); // Тимчасовий лог
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        throw error;
      }
      logger.error(`Помилка логіну: ${error.message}`);
      throw new AppError('Не вдалося виконати вхід', 500);
    }
  }

  // Оновлення токенів
  async refresh(refreshToken) {
    try {
      // Валідація refresh token
      const decoded = TokenService.validateRefreshToken(refreshToken);
      
      // Пошук токена в базі користувача
      const tokenExists = await TokenService.findRefreshToken(decoded.userId, refreshToken);
      if (!tokenExists) {
        throw new AppError('Недійсний refresh token', 401);
      }

      // Видалення старого токена
      await TokenService.removeRefreshToken(decoded.userId, refreshToken);

      // Генерація нових токенів
      const { accessToken, refreshToken: newRefreshToken } = TokenService.generateTokens({
        userId: decoded.userId,
        email: decoded.email
      });

      // Збереження нового refresh token
      await TokenService.saveRefreshToken(decoded.userId, newRefreshToken);

      // Отримання користувача
      const user = await UserRepository.findById(decoded.userId);
      const userDTO = require('../dtos/user.dto').UserDTO.fromModel(user);

      logger.info(`Оновлено токени для користувача: ${user.email}`);
      
      return {
        user: userDTO.toJSON(),
        accessToken,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка оновлення токенів: ${error.message}`);
      throw new AppError('Не вдалося оновити токени', 401);
    }
  }

  // Вихід користувача
  async logout(userId, refreshToken) {
    try {
      // Видалення токена з бази
      await TokenService.removeRefreshToken(userId, refreshToken);
      
      logger.info(`Користувач вийшов з системи: ${userId}`);
      
      return { message: 'Успішний вихід' };
    } catch (error) {
      logger.error(`Помилка виходу: ${error.message}`);
      throw new AppError('Не вдалося виконати вихід', 500);
    }
  }

  // Зміна пароля
  async changePassword(userId, oldPassword, newPassword) {
    try {
      // Отримання користувача
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new AppError('Користувача не знайдено', 404);
      }

      // Перевірка старого пароля
      const isOldPasswordValid = await user.comparePassword(oldPassword);
      if (!isOldPasswordValid) {
        throw new AppError('Невірний поточний пароль', 400);
      }

      // Валідація нового пароля
      if (newPassword.length < 8) {
        throw new AppError('Новий пароль має містити принаймні 8 символів', 400);
      }

      // Хешування нового пароля
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Оновлення пароля в базі
      const updatedUser = await UserRepository.updatePassword(userId, hashedNewPassword);

      // Інвалідація всіх refresh tokens
      await TokenService.invalidateAllTokens(userId);

      logger.info(`Змінено пароль для користувача: ${user.email}`);
      
      return { message: 'Пароль успішно змінено' };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка зміни пароля: ${error.message}`);
      throw new AppError('Не вдалося змінити пароль', 500);
    }
  }

  // Забули пароль
  async forgotPassword(email) {
    try {
      // Пошук користувача
      const user = await UserRepository.findByEmail(email);
      if (!user) {
        // Не повідомляємо про відсутність користувача для безпеки
        return { message: 'Якщо користувач існує, посилання для скидання пароля буде надіслано на email' };
      }

      // Генерація reset token
      const { resetToken, hashedToken, token } = TokenService.generateResetToken();

      // Збереження reset token в базі
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 година термін дії

      await UserRepository.saveResetToken(user._id, hashedToken, expiresAt);

      logger.info(`Надіслано посилання для скидання пароля: ${email}`);
      
      return { 
        message: 'Посилання для скидання пароля надіслано на email',
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
      };

    } catch (error) {
      logger.error(`Помилка скидання пароля: ${error.message}`);
      throw new AppError('Не вдалося обробити запит на скидання пароля', 500);
    }
  }

  // Скидання пароля
  async resetPassword(token, newPassword) {
    try {
      // Валідація reset token
      const decoded = TokenService.validateResetToken(token);
      
      // Пошук користувача за reset token
      const user = await UserRepository.findByResetToken(decoded.resetToken);
      if (!user) {
        throw new AppError('Недійсний або прострочений токен скидання пароля', 400);
      }

      // Валідація нового пароля
      if (newPassword.length < 8) {
        throw new AppError('Пароль має містити принаймні 8 символів', 400);
      }

      // Хешування нового пароля
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Оновлення пароля в базі
      await UserRepository.updatePassword(user._id, hashedNewPassword);

      // Видалення reset token
      await UserRepository.clearResetToken(user._id);

      // Інвалідація всіх refresh tokens
      await TokenService.invalidateAllTokens(user._id);

      logger.info(`Скинуто пароль для користувача: ${user.email}`);
      
      return { message: 'Пароль успішно скинуто' };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка скидання пароля: ${error.message}`);
      throw new AppError('Не вдалося скинути пароль', 500);
    }
  }

  // Отримання інформації про користувача
  async getCurrentUser(userId) {
    try {
      const user = await UserRepository.findById(userId);
      if (!user) {
        throw new AppError('Користувача не знайдено', 404);
      }

      const userDTO = require('../dtos/user.dto').UserDTO.fromModel(user);
      
      return {
        user: userDTO.toJSON()
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка отримання інформації про користувача: ${error.message}`);
      throw new AppError('Не вдалося отримати інформацію про користувача', 500);
    }
  }

  // Оновлення профілю користувача
  async updateProfile(userId, updateData) {
    try {
      // Створення та валідація DTO
      const updateDTO = new UpdateUserDTO(updateData);
      const validationErrors = updateDTO.validate();
      
      if (validationErrors.length > 0) {
        throw new AppError(`Помилка валідації: ${validationErrors.join(', ')}`, 400);
      }

      const sanitizedData = updateDTO.sanitize();

      // Оновлення даних користувача
      const updatedUser = await UserRepository.update(userId, sanitizedData);

      const userDTO = require('../dtos/user.dto').UserDTO.fromModel(updatedUser);
      
      logger.info(`Оновлено профіль користувача: ${userId}`);
      
      return {
        user: userDTO.toJSON(),
        message: 'Профіль успішно оновлено'
      };

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error(`Помилка оновлення профілю: ${error.message}`);
      throw new AppError('Не вдалося оновити профіль', 500);
    }
  }
}

module.exports = new AuthService();