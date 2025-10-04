const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'ID користувача є обов\'язковим'],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Опис порушення є обов\'язковим'],
    trim: true,
    minlength: [10, 'Опис має містити принаймні 10 символів'],
    maxlength: [500, 'Опис не може перевищувати 1000 символів']
  },
  category: {
    type: String,
    required: [true, 'Категорія є обов\'язковою'],
    enum: {
      values: ['traffic', 'parking' ,'trash', 'environment', 'public_safety', 'infrastructure', 'vandalism', 'noise',  'other'],
      message: 'Категорія має бути однією з: traffic, environment, public_safety, parking,  trash, vandalism, infrastructure, noise, other'
    },
    default: 'other'
  },
  photoUrl: {
    type: String,
    default: null,
    match: [
      /^https?:\/\/.+/,
      'Невірний формат URL фото'
    ]
  },
  dateTime: {
    type: Date,
    required: [true, 'Дата та час порушення є обов\'язковими'],
    index: true,
    validate: {
      validator: function(date) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return date <= now && date >= thirtyDaysAgo;
      },
      message: 'Дата порушення не може бути в майбутньому або старшою за 30 днів'
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      index: '2dsphere',
      validate: [
        {
          validator: function(coords) {
            return coords.length === 2;
          },
          message: 'Координати мають містити довготу та широту'
        },
        {
          validator: function(coords) {
            const [longitude, latitude] = coords;
            return longitude >= -180 && longitude <= 180;
          },
          message: 'Довгота має бути в діапазоні від -180 до 180'
        },
        {
          validator: function(coords) {
            const [longitude, latitude] = coords;
            return latitude >= -90 && latitude <= 90;
          },
          message: 'Широта має бути в діапазоні від -90 до 90'
        }
      ]
    }
  },
  isSynced: {
    type: Boolean,
    default: false,
    index: true
  },
  cloudinaryPublicId: {
    type: String
  }
}, {
  timestamps: true
});

// Індекси
violationSchema.index({ userId: 1, dateTime: 1 });
violationSchema.index({ userId: 1, isSynced: 1 });
violationSchema.index({ createdAt: 1 });

// Віртуальні поля
violationSchema.virtual('formattedDate').get(function() {
  return this.dateTime.toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

violationSchema.virtual('locationString').get(function() {
  if (this.location && this.location.coordinates) {
    const [longitude, latitude] = this.location.coordinates;
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
  return '';
});

// Middleware для валідації координат перед збереженням
violationSchema.pre('save', function(next) {
  if (this.location && this.location.coordinates) {
    const [longitude, latitude] = this.location.coordinates;
    
    if (longitude < -180 || longitude > 180) {
      return next(new Error('Довгота має бути в діапазоні від -180 до 180'));
    }
    
    if (latitude < -90 || latitude > 90) {
      return next(new Error('Широта має бути в діапазоні від -90 до 90'));
    }
  }
  next();
});

// Middleware для видалення фото з Cloudinary перед видаленням порушення
violationSchema.pre('remove', async function(next) {
  if (this.cloudinaryPublicId) {
    try {
      const cloudinary = require('../../config/cloudinary');
      await cloudinary.uploader.destroy(this.cloudinaryPublicId);
    } catch (error) {
      console.error('Помилка видалення фото з Cloudinary:', error);
    }
  }
  next();
});

// Instance methods
violationSchema.methods.toPublicJSON = function() {
  const violationObject = this.toObject();
  delete violationObject.__v;
  delete violationObject.cloudinaryPublicId;
  return violationObject;
};

violationSchema.methods.getDaysAgo = function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.dateTime);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Static methods
violationSchema.statics.findByUserAndDate = function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.find({
    userId,
    dateTime: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });
};

violationSchema.statics.findUnsyncedByUser = function(userId) {
  return this.find({
    userId,
    isSynced: false
  });
};

violationSchema.statics.getViolationDates = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $project: { date: { $dateToString: { format: '%Y-%m-%d', date: '$dateTime' } } } },
    { $group: { _id: '$date' } },
    { $sort: { _id: -1 } }
  ]);
};

module.exports = mongoose.model('Violation', violationSchema);