const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Ім\'я є обов\'язковим'],
    trim: true,
    minlength: [1, 'Ім\'я має містити принаймні 1 символ'],
    maxlength: [50, 'Ім\'я не може перевищувати 50 символів'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Zа-яА-ЯїЇіІєЄґҐ\s\-']+$/u.test(v);
      },
      message: 'Ім\'я може містити лише літери, пробіли, дефіси та апострофи'
    }
  },
  lastName: {
    type: String,
    required: [true, 'Прізвище є обов\'язковим'],
    trim: true,
    minlength: [1, 'Прізвище має містити принаймні 1 символ'],
    maxlength: [50, 'Прізвище не може перевищувати 50 символів'],
    validate: {
      validator: function(v) {
        return /^[a-zA-Zа-яА-ЯїЇіІєЄґҐ\s\-']+$/u.test(v);
      },
      message: 'Прізвище може містити лише літери, пробіли, дефіси та апострофи'
    }
  },
  email: {
    type: String,
    required: [true, 'Email є обов\'язковим'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Будь ласка, введіть коректний email'
    ],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Пароль є обов\'язковим'],
    minlength: [8, 'Пароль має містити принаймні 8 символів'],
    maxlength: [128, 'Пароль не може перевищувати 128 символів'],
    select: false,
    validate: {
    validator: function(v) {
        // Валідація без обов'язкового спецсимволу
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&#]/.test(v);
      },
      message: 'Пароль має містити принаймні 1 велику літеру, 1 малу літеру та 1 цифру'
    }
  },
  refreshTokens: {
    type: [
      {
        token: {
          type: String,
          required: true
        },
        expiresAt: {
          type: Date,
          required: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    default: []
  }
}, {
  timestamps: true
});

// Віртуальне поле fullName
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});


// Instance method для порівняння паролів

userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    console.log('=== Password Comparison Debug ===');
    console.log('Candidate password:', candidatePassword);
    console.log('Stored hashed password:', this.password);
    console.log('Password length:', candidatePassword.length);
    
    // Перевірка чи існує збережений пароль
    if (!this.password) {
      console.log('❌ No stored password found');
      return false;
    }
    
    // Перевірка чи пароль не порожній
    if (!candidatePassword) {
      console.log('❌ No candidate password provided');
      return false;
    }
    
    // Спроба порівняння з використанням bcrypt
    console.log('🔍 Attempting bcrypt comparison...');
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('✅ Bcrypt comparison result:', isMatch);
    
    // Якщо паролі не збігаються
    if (!isMatch) {
      console.log('❌ PASSWORDS DO NOT MATCH!');
      console.log('- Candidate password hash attempt:', await bcrypt.hash(candidatePassword, 10));
      console.log('- Stored password length:', this.password.length);
      console.log('- Stored password prefix:', this.password.substring(0, 10) + '...');
      console.log('📍 ERROR: Пароль не збігається - проблема НЕ в цьому методі!');
      console.log('📍 Можливі причини:');
      console.log('  1. Неправильний пароль при логіні');
      console.log('  2. Пароль був змінений в БД вручну');
      console.log('  3. Проблема з кодуванням символів');
      return false;
    }
    
    // Якщо паролі збігаються
    console.log('✅ PASSWORDS MATCH! Успіх!');
    console.log('📍 Пароль правильний - проблема НЕ тут!');
    return true;
    
  } catch (error) {
    console.error('💥 ERROR in password comparison:', error.message);
    console.error('💥 Error stack:', error.stack);
    console.log('📍 ERROR: Проблема в цьому методі!');
    return false;
  }
};
// Instance method для виключення password з JSON виводу
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Static method для пошуку за email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email });
};

// Static method для пошуку за refresh token
userSchema.statics.findByRefreshToken = function(token) {
  return this.findOne({ 'refreshTokens.token': token });
};

// Залишити тільки:
userSchema.index({ createdAt: 1 });

module.exports = mongoose.model('User', userSchema);