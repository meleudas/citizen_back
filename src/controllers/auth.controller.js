// controllers/auth.controller.js (повністю оновлена версія)

const AuthService = require('../services/auth.service');
const { 
  registerValidation, 
  loginValidation, 
  refreshValidation, 
  changePasswordValidation,
  resetPasswordValidation,
  forgotPasswordValidation,
  validate 
} = require('../validators/auth.validator');
const { 
  AppError, 
  ValidationError, 
  AuthenticationError, 
  NotFoundError 
} = require('../utils/errors');
const logger = require('../../config/logger');

class AuthController {
  // Реєстрація
  async register(req, res, next) {
    try {
      // Валідація даних
      await Promise.all(registerValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { firstName, lastName, email, password } = req.body;

      // Виклик сервісу реєстрації
      const result = await AuthService.register({
        firstName,
        lastName,
        email,
        password
      });

      // Установка refresh token в cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 днів
      });

      // Логування успішної реєстрації
      logger.info(`Користувач зареєстрований: ${email}`, { userId: result.user.id });

      // Відповідь
      res.status(201).json({
        success: true,
        message: 'Користувач успішно зареєстрований',
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });

    } catch (error) {
      logger.error(`Помилка реєстрації: ${error.message}`, { 
        email: req.body.email,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          details: error.details
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Логін
async login(req, res, next) {
  console.log('Login attempt:', req.body); // Тимчасовий лог
  
  try {
    // Валідація даних
    await Promise.all(loginValidation.map(validation => validation.run(req)));
    // ВИДАЛИТИ цей рядок:
    // validate(req, res, () => {});
    
    const { email, password } = req.body;
    console.log('Validated data:', { email, password }); // Тимчасовий лог

    // Санітизація даних (якщо потрібно)
    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedPassword = password.trim();
    console.log('Sanitized login data:', { email: sanitizedEmail, password: sanitizedPassword });

    // Виклик сервісу логіну
    const result = await AuthService.login(sanitizedEmail, sanitizedPassword);
    
    console.log('Login result:', result); // Тимчасовий лог

    // Установка refresh token в cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 днів
    });

    // Логування успішного логіну
    logger.info(`Користувач увійшов: ${sanitizedEmail}`, { userId: result.user.id });

    // Відповідь
    res.status(200).json({
      success: true,
      message: 'Успішний вхід',
      data: {
        user: result.user,
        accessToken: result.accessToken
      }
    });

  } catch (error) {
    console.log('Login error:', error); // Тимчасовий лог
    logger.error(`Помилка логіну: ${error.message}`, { 
      email: req.body.email,
      error: error.message,
      stack: error.stack 
    });
    
    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
}

  // Refresh токенів
  async refresh(req, res, next) {
    try {
      // Отримання refresh token з cookie або body
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        throw new AuthenticationError('Refresh token не надано');
      }

      // Валідація refresh token
      await Promise.all(refreshValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      // Виклик сервісу refresh
      const result = await AuthService.refresh(refreshToken);

      // Оновлення refresh token в cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 днів
      });

      // Відповідь
      res.status(200).json({
        success: true,
        message: 'Токени успішно оновлено',
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });

    } catch (error) {
      logger.error(`Помилка оновлення токенів: ${error.message}`, { 
        error: error.message,
        stack: error.stack 
      });
      
      // Очищення cookie при помилці
      res.clearCookie('refreshToken');
      
      if (error instanceof AuthenticationError) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Вихід
  async logout(req, res, next) {
    try {
      const userId = req.user?.id;
      const refreshToken = req.cookies.refreshToken;

      if (!userId || !refreshToken) {
        throw new ValidationError('Недійсні дані для виходу');
      }

      // Виклик сервісу logout
      await AuthService.logout(userId, refreshToken);

      // Очищення refresh token cookie
      res.clearCookie('refreshToken');

      // Відповідь
      res.status(200).json({
        success: true,
        message: 'Успішний вихід'
      });

    } catch (error) {
      logger.error(`Помилка виходу: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Зміна пароля
  async changePassword(req, res, next) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AuthenticationError('Користувач не авторизований');
      }

      // Валідація даних
      await Promise.all(changePasswordValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { oldPassword, newPassword } = req.body;

      // Виклик сервісу зміни пароля
      const result = await AuthService.changePassword(userId, oldPassword, newPassword);

      // Відповідь
      res.status(200).json({
        success: true,
        message: result.message
      });

    } catch (error) {
      logger.error(`Помилка зміни пароля: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Запит на скидання пароля
  async forgotPassword(req, res, next) {
    try {
      // Валідація даних
      await Promise.all(forgotPasswordValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { email } = req.body;

      // Виклик сервісу забутий пароль
      const result = await AuthService.forgotPassword(email);

      // Відповідь
      res.status(200).json({
        success: true,
        message: result.message,
        ...(process.env.NODE_ENV === 'development' && result.resetToken && { resetToken: result.resetToken })
      });

    } catch (error) {
      logger.error(`Помилка запиту на скидання пароля: ${error.message}`, { 
        email: req.body.email,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Скидання пароля
  async resetPassword(req, res, next) {
    try {
      // Валідація даних
      await Promise.all(resetPasswordValidation.map(validation => validation.run(req)));
      validate(req, res, () => {});

      const { token, newPassword } = req.body;

      // Виклик сервісу скидання пароля
      const result = await AuthService.resetPassword(token, newPassword);

      // Відповідь
      res.status(200).json({
        success: true,
        message: result.message
      });

    } catch (error) {
      logger.error(`Помилка скидання пароля: ${error.message}`, { 
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Отримання поточного користувача
  async getCurrentUser(req, res, next) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AuthenticationError('Користувач не авторизований');
      }

      // Виклик сервісу отримання поточного користувача
      const result = await AuthService.getCurrentUser(userId);

      // Відповідь
      res.status(200).json({
        success: true,
        data: {
          user: result.user
        }
      });

    } catch (error) {
      logger.error(`Помилка отримання поточного користувача: ${error.message}`, { 
        userId: req.user?.id,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof AuthenticationError) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }

  // Оновлення профілю користувача
  async updateProfile(req, res, next) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        throw new AuthenticationError('Користувач не авторизований');
      }

      // Валідація даних
      const updateProfileValidation = [
        req.body.firstName !== undefined && require('express-validator').body('firstName')
          .trim()
          .escape()
          .isLength({ min: 1, max: 50 })
          .withMessage('Ім\'я має містити від 1 до 50 символів'),
        req.body.lastName !== undefined && require('express-validator').body('lastName')
          .trim()
          .escape()
          .isLength({ min: 1, max: 50 })
          .withMessage('Прізвище має містити від 1 до 50 символів')
      ].filter(Boolean);

      if (updateProfileValidation.length > 0) {
        await Promise.all(updateProfileValidation.map(validation => validation.run(req)));
        validate(req, res, () => {});
      }

      // Виклик сервісу оновлення профілю
      const result = await AuthService.updateProfile(userId, req.body);

      // Відповідь
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          user: result.user
        }
      });

    } catch (error) {
      logger.error(`Помилка оновлення профілю: ${error.message}`, { 
        userId: req.user?.id,
        updateData: req.body,
        error: error.message,
        stack: error.stack 
      });
      
      if (error instanceof ValidationError || error instanceof AuthenticationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
          details: error.details
        });
      }
      
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      }
      
      next(error);
    }
  }
}

module.exports = new AuthController();