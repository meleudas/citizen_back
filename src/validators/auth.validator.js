// validators/auth.validator.js

const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation.middleware');

// Список загальновживаних паролів (для прикладу)
const commonPasswords = [
  'password', '12345678', 'qwerty123', 'admin123', 'welcome123',
  'password123', '123456789', 'qwertyuiop', 'abc123456', '00000000'
];

// Українськомовні повідомлення помилок
const errorMessages = {
  required: (field) => `${field} є обов'язковим полем`,
  string: (field) => `${field} має бути текстовим рядком`,
  email: 'Будь ласка, введіть коректний email',
  minLength: (field, min) => `${field} має містити принаймні ${min} символів`,
  maxLength: (field, max) => `${field} не може перевищувати ${max} символів`,
  pattern: (field) => `${field} містить недопустимі символи`,
  passwordStrength: 'Пароль має містити принаймні 1 велику літеру, 1 малу літеру та 1 цифру',
  commonPassword: 'Будь ласка, оберіть більш надійний пароль',
  jwt: 'Недійсний формат токена'
};

// Валідація реєстрації
const registerValidation = [
  // Валідація firstName
  body('firstName')
    .trim()
    .escape()
    .notEmpty()
    .withMessage(errorMessages.required('Ім\'я'))
    .isLength({ min: 1, max: 50 })
    .withMessage(errorMessages.minLength('Ім\'я', 1))
    .matches(/^[a-zA-Zа-яА-ЯїЇіІєЄґҐ\s\-']+$/u)
    .withMessage(errorMessages.pattern('Ім\'я')),

  // Валідація lastName
  body('lastName')
    .trim()
    .escape()
    .notEmpty()
    .withMessage(errorMessages.required('Прізвище'))
    .isLength({ min: 1, max: 50 })
    .withMessage(errorMessages.minLength('Прізвище', 1))
    .matches(/^[a-zA-Zа-яА-ЯїЇіІєЄґҐ\s\-']+$/u)
    .withMessage(errorMessages.pattern('Прізвище')),

  // Валідація email
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage(errorMessages.required('Email'))
    .isEmail()
    .withMessage(errorMessages.email)
    .isLength({ max: 254 })
    .withMessage(errorMessages.maxLength('Email', 254)),

  // Валідація password - ВИПРАВЛЕНО: видалено обов'язковий спецсимвол
  body('password')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Пароль'))
    .isLength({ min: 8, max: 128 })
    .withMessage(errorMessages.minLength('Пароль', 8))
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&#]/)
    .withMessage(errorMessages.passwordStrength)
    .custom((value) => {
      const lowerValue = value.toLowerCase();
      const isCommon = commonPasswords.some(pwd => lowerValue.includes(pwd));
      if (isCommon) {
        throw new Error(errorMessages.commonPassword);
      }
      return true;
    })
];

// Валідація логіну
const loginValidation = [
  // Валідація email
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage(errorMessages.required('Email'))
    .isEmail()
    .withMessage(errorMessages.email),

  // Валідація password (без зайвих перевірок довжини для логіну)
  body('password')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Пароль'))
];

// Валідація refresh token
const refreshValidation = [
  body('refreshToken')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Refresh token'))
    .matches(/^[\w\-\.]+$/)
    .withMessage(errorMessages.jwt)
];

// Валідація зміни пароля
const changePasswordValidation = [
  // Валідація старого пароля
  body('oldPassword')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Поточний пароль'))
    .isLength({ min: 8, max: 128 })
    .withMessage(errorMessages.minLength('Поточний пароль', 8)),

  // Валідація нового пароля - ВИПРАВЛЕНО: видалено обов'язковий спецсимвол
  body('newPassword')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Новий пароль'))
    .isLength({ min: 8, max: 128 })
    .withMessage(errorMessages.minLength('Новий пароль', 8))
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&#]/)
    .withMessage(errorMessages.passwordStrength)
    .custom((value) => {
      const lowerValue = value.toLowerCase();
      const isCommon = commonPasswords.some(pwd => lowerValue.includes(pwd));
      if (isCommon) {
        throw new Error(errorMessages.commonPassword);
      }
      return true;
    })
    .custom((value, { req }) => {
      if (value === req.body.oldPassword) {
        throw new Error('Новий пароль має відрізнятися від поточного');
      }
      return true;
    })
];

// Валідація скидання пароля
const resetPasswordValidation = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Токен скидання пароля'))
    .matches(/^[\w\-\.]+$/)
    .withMessage(errorMessages.jwt),

  // Валідація нового пароля - ВИПРАВЛЕНО: видалено обов'язковий спецсимвол
  body('newPassword')
    .trim()
    .notEmpty()
    .withMessage(errorMessages.required('Новий пароль'))
    .isLength({ min: 8, max: 128 })
    .withMessage(errorMessages.minLength('Новий пароль', 8))
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&#]/)
    .withMessage(errorMessages.passwordStrength)
    .custom((value) => {
      const lowerValue = value.toLowerCase();
      const isCommon = commonPasswords.some(pwd => lowerValue.includes(pwd));
      if (isCommon) {
        throw new Error(errorMessages.commonPassword);
      }
      return true;
    })
];

// Валідація запиту на скидання пароля
const forgotPasswordValidation = [
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage(errorMessages.required('Email'))
    .isEmail()
    .withMessage(errorMessages.email)
];

// Експорт усіх валідаційних правил та middleware
module.exports = {
  registerValidation,
  loginValidation,
  refreshValidation,
  changePasswordValidation,
  resetPasswordValidation,
  forgotPasswordValidation,
  validate: handleValidationErrors // Використовуємо middleware з validation.middleware.js
};