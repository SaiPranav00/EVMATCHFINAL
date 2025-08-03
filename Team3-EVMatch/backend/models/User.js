const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

// Configuration object - can be loaded from environment or config service
const userConfig = {
  validation: {
    name: {
      minLength: parseInt(process.env.NAME_MIN_LENGTH) || 2,
      maxLength: parseInt(process.env.NAME_MAX_LENGTH) || 50,
      required: process.env.NAME_REQUIRED !== 'false'
    },
    password: {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
      required: process.env.PASSWORD_REQUIRED !== 'false'
    },
    email: {
      pattern: process.env.EMAIL_PATTERN || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      required: process.env.EMAIL_REQUIRED !== 'false'
    }
  },
  roles: process.env.USER_ROLES?.split(',') || ["user", "admin"],
  bodyTypes: process.env.BODY_TYPES?.split(',') ||
    ["Sedan", "SUV", "Hatchback", "Coupe", "Truck", "Convertible"],
  chargingTypes: process.env.CHARGING_TYPES?.split(',') ||
    ["Level 1", "Level 2", "DC Fast", "Any"],
  limits: {
    viewHistory: parseInt(process.env.VIEW_HISTORY_LIMIT) || 50,
    quizResults: parseInt(process.env.QUIZ_RESULTS_LIMIT) || 10,
    budgetMax: parseInt(process.env.BUDGET_MAX_DEFAULT) || 100000,
    rangeMax: parseInt(process.env.RANGE_MAX_DEFAULT) || 500,
    quizScoreMax: parseInt(process.env.QUIZ_SCORE_MAX) || 100
  },
  tokens: {
    jwtExpiry: process.env.JWT_EXPIRE || "7d",
    emailVerificationExpiry: parseInt(process.env.EMAIL_VERIFICATION_EXPIRY) || 24 * 60 * 60 * 1000, // 24 hours
    passwordResetExpiry: parseInt(process.env.PASSWORD_RESET_EXPIRY) || 10 * 60 * 1000, // 10 minutes
    tokenLength: parseInt(process.env.TOKEN_LENGTH) || 32
  },
  features: {
    enableEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION !== 'false',
    enablePasswordReset: process.env.ENABLE_PASSWORD_RESET !== 'false',
    enableUserStats: process.env.ENABLE_USER_STATS !== 'false',
    enableExternalValidation: process.env.ENABLE_EXTERNAL_USER_VALIDATION === 'true'
  },
  references: {
    vehicleModel: process.env.VEHICLE_MODEL_NAME || "Vehicle"
  }
}

// Dynamic budget range schema
const createBudgetSchema = () => ({
  min: { type: Number, default: 0 },
  max: { type: Number, default: userConfig.limits.budgetMax }
})

// Dynamic range schema
const createRangeSchema = () => ({
  min: { type: Number, default: 0 },
  max: { type: Number, default: userConfig.limits.rangeMax }
})

// Dynamic notifications schema
const createNotificationsSchema = () => {
  const notificationTypes = process.env.NOTIFICATION_TYPES?.split(',') ||
    ['email', 'priceAlerts', 'newModels', 'newsletter']

  const schema = {}
  notificationTypes.forEach(type => {
    schema[type] = {
      type: Boolean,
      default: process.env[`${type.toUpperCase()}_DEFAULT`] === 'true' || false
    }
  })
  return schema
}

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: userConfig.validation.name.required ?
        [true, "First name is required"] : false,
      trim: true,
      minlength: [
        userConfig.validation.name.minLength,
        `First name must be at least ${userConfig.validation.name.minLength} characters`
      ],
      maxlength: [
        userConfig.validation.name.maxLength,
        `First name cannot exceed ${userConfig.validation.name.maxLength} characters`
      ],
    },
    lastName: {
      type: String,
      required: userConfig.validation.name.required ?
        [true, "Last name is required"] : false,
      trim: true,
      minlength: [
        userConfig.validation.name.minLength,
        `Last name must be at least ${userConfig.validation.name.minLength} characters`
      ],
      maxlength: [
        userConfig.validation.name.maxLength,
        `Last name cannot exceed ${userConfig.validation.name.maxLength} characters`
      ],
    },
    email: {
      type: String,
      required: userConfig.validation.email.required ?
        [true, "Email is required"] : false,
      unique: true,
      lowercase: true,
      trim: true,
      match: [userConfig.validation.email.pattern, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: userConfig.validation.password.required ?
        [true, "Password is required"] : false,
      minlength: [
        userConfig.validation.password.minLength,
        `Password must be at least ${userConfig.validation.password.minLength} characters`
      ],
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: userConfig.roles,
        message: `Role must be one of: ${userConfig.roles.join(', ')}`
      },
      default: userConfig.roles[0] || "user",
    },
    isEmailVerified: {
      type: Boolean,
      default: !userConfig.features.enableEmailVerification,
    },
    emailVerifiedAt: {
      type: Date,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    // OTP fields for email verification
    otp: String,
    otpExpires: Date,
    isOtpVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    loginCount: { type: Number, default: 0 },
    preferences: {
      budget: createBudgetSchema(),
      range: createRangeSchema(),
      bodyTypes: [
        {
          type: String,
          enum: {
            values: userConfig.bodyTypes,
            message: `Body type must be one of: ${userConfig.bodyTypes.join(', ')}`
          }
        },
      ],
      brands: [String],
      features: [String],
      chargingType: {
        type: String,
        enum: {
          values: userConfig.chargingTypes,
          message: `Charging type must be one of: ${userConfig.chargingTypes.join(', ')}`
        },
        default: userConfig.chargingTypes[userConfig.chargingTypes.length - 1] || "Any",
      },
      notifications: createNotificationsSchema(),
    },
    stats: userConfig.features.enableUserStats ? {
      viewedCount: { type: Number, default: 0 },
      favoritesCount: { type: Number, default: 0 },
      comparisonsCount: { type: Number, default: 0 },
      quizScore: {
        type: Number,
        min: 0,
        max: userConfig.limits.quizScoreMax
      },
    } : undefined,
    favoriteVehicles: [
      {
        vehicleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: userConfig.references.vehicleModel,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    viewHistory: [
      {
        vehicleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: userConfig.references.vehicleModel,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    searchHistory: [
      {
        query: String,
        filters: mongoose.Schema.Types.Mixed,
        searchedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    quizResults: [
      {
        score: {
          type: Number,
          min: 0,
          max: userConfig.limits.quizScoreMax
        },
        recommendations: [String],
        completedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Dynamic indexing
userSchema.index({ email: 1 })
if (userConfig.features.enableEmailVerification) {
  userSchema.index({ isEmailVerified: 1 })
}
userSchema.index({ createdAt: -1 })
userSchema.index({ lastLogin: -1 })

// Additional indexes from environment
const additionalIndexes = process.env.USER_ADDITIONAL_INDEXES?.split(',') || []
additionalIndexes.forEach(indexField => {
  if (indexField.trim()) {
    userSchema.index({ [indexField.trim()]: 1 })
  }
})

// API integration for external validation
userSchema.pre('save', async function (next) {
  if (userConfig.features.enableExternalValidation && this.isNew) {
    try {
      const validationResponse = await fetch(process.env.USER_VALIDATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          email: this.email,
          firstName: this.firstName,
          lastName: this.lastName
        })
      })

      if (!validationResponse.ok) {
        const error = await validationResponse.json()
        throw new Error(`External user validation failed: ${error.message}`)
      }

      const validationResult = await validationResponse.json()
      if (validationResult.blocked) {
        throw new Error('User registration blocked by validation service')
      }
    } catch (error) {
      console.error('External user validation error:', error)
      if (process.env.STRICT_VALIDATION === 'true') {
        return next(error)
      }
    }
  }
  next()
})

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(userConfig.validation.password.saltRounds)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password method with API logging
userSchema.methods.comparePassword = async function (candidatePassword) {
  const isMatch = await bcrypt.compare(candidatePassword, this.password)

  // API call for login attempt logging
  if (process.env.LOGIN_LOGGING_API_URL) {
    try {
      await fetch(process.env.LOGIN_LOGGING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          userId: this._id,
          email: this.email,
          success: isMatch,
          timestamp: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Login logging API error:', error)
    }
  }

  return isMatch
}

// Generate JWT token with dynamic configuration
userSchema.methods.generateAuthToken = function () {
  const payload = {
    id: this._id,
    email: this.email,
    role: this.role
  }

  // Add additional claims from environment
  const additionalClaims = process.env.JWT_ADDITIONAL_CLAIMS?.split(',') || []
  additionalClaims.forEach(claim => {
    if (this[claim]) {
      payload[claim] = this[claim]
    }
  })

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn: userConfig.tokens.jwtExpiry,
      issuer: process.env.JWT_ISSUER || 'app',
      audience: process.env.JWT_AUDIENCE || 'users'
    }
  )
}

// Generate email verification token with API integration
userSchema.methods.generateEmailVerificationToken = function () {
  if (!userConfig.features.enableEmailVerification) return null

  const crypto = require("crypto")
  const token = crypto.randomBytes(userConfig.tokens.tokenLength).toString("hex")

  this.emailVerificationToken = crypto.createHash("sha256").update(token).digest("hex")
  this.emailVerificationExpires = Date.now() + userConfig.tokens.emailVerificationExpiry

  // API call to email service
  if (process.env.EMAIL_SERVICE_API_URL) {
    fetch(process.env.EMAIL_SERVICE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
      },
      body: JSON.stringify({
        type: 'email_verification',
        email: this.email,
        token: token,
        userId: this._id
      })
    }).catch(error => {
      console.error('Email service API error:', error)
    })
  }

  return token
}

// Generate password reset token with API integration
userSchema.methods.generatePasswordResetToken = function () {
  if (!userConfig.features.enablePasswordReset) return null

  const crypto = require("crypto")
  const token = crypto.randomBytes(userConfig.tokens.tokenLength).toString("hex")

  this.passwordResetToken = crypto.createHash("sha256").update(token).digest("hex")
  this.passwordResetExpires = Date.now() + userConfig.tokens.passwordResetExpiry

  // API call to security service
  if (process.env.SECURITY_LOG_API_URL) {
    fetch(process.env.SECURITY_LOG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
      },
      body: JSON.stringify({
        event: 'password_reset_requested',
        userId: this._id,
        email: this.email,
        timestamp: new Date().toISOString()
      })
    }).catch(error => {
      console.error('Security log API error:', error)
    })
  }

  return token
}

// Generate OTP for email verification
userSchema.methods.generateOTP = function () {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString()

  this.otp = otp
  this.otpExpires = Date.now() + (10 * 60 * 1000) // 10 minutes expiry
  this.isOtpVerified = false

  return otp
}

// Verify OTP
userSchema.methods.verifyOTP = function (candidateOTP) {
  if (!this.otp || !this.otpExpires) {
    return false
  }

  if (Date.now() > this.otpExpires) {
    return false // OTP expired
  }

  if (this.otp !== candidateOTP) {
    return false // OTP doesn't match
  }

  // OTP is valid
  this.isOtpVerified = true
  this.isEmailVerified = true
  this.emailVerifiedAt = new Date()
  this.otp = undefined
  this.otpExpires = undefined

  return true
}

// Clear OTP
userSchema.methods.clearOTP = function () {
  this.otp = undefined
  this.otpExpires = undefined
}

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`
})

// Virtual for initials
userSchema.virtual("initials").get(function () {
  return `${this.firstName.charAt(0)}${this.lastName.charAt(0)}`.toUpperCase()
})

// Pre-save middleware to update stats
if (userConfig.features.enableUserStats) {
  userSchema.pre("save", function (next) {
    if (this.isModified("favoriteVehicles")) {
      this.stats.favoritesCount = this.favoriteVehicles.length
    }
    next()
  })
}

// Method to add vehicle to favorites with API integration
userSchema.methods.addToFavorites = async function (vehicleId) {
  const existingFavorite = this.favoriteVehicles.find(
    (fav) => fav.vehicleId.toString() === vehicleId.toString()
  )

  if (!existingFavorite) {
    this.favoriteVehicles.push({ vehicleId })
    if (userConfig.features.enableUserStats) {
      this.stats.favoritesCount = this.favoriteVehicles.length
    }

    // API call to analytics service
    if (process.env.ANALYTICS_API_URL) {
      try {
        await fetch(process.env.ANALYTICS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
          },
          body: JSON.stringify({
            event: 'vehicle_favorited',
            userId: this._id,
            vehicleId: vehicleId,
            timestamp: new Date().toISOString()
          })
        })
      } catch (error) {
        console.error('Analytics API error:', error)
      }
    }
  }

  return this.save()
}

// Method to remove vehicle from favorites
userSchema.methods.removeFromFavorites = function (vehicleId) {
  this.favoriteVehicles = this.favoriteVehicles.filter(
    (fav) => fav.vehicleId.toString() !== vehicleId.toString()
  )
  if (userConfig.features.enableUserStats) {
    this.stats.favoritesCount = this.favoriteVehicles.length
  }

  return this.save()
}

// Method to add to view history with dynamic limits
userSchema.methods.addToViewHistory = function (vehicleId) {
  this.viewHistory = this.viewHistory.filter(
    (view) => view.vehicleId.toString() !== vehicleId.toString()
  )

  this.viewHistory.unshift({ vehicleId })

  if (this.viewHistory.length > userConfig.limits.viewHistory) {
    this.viewHistory = this.viewHistory.slice(0, userConfig.limits.viewHistory)
  }

  if (userConfig.features.enableUserStats) {
    this.stats.viewedCount = this.viewHistory.length
  }

  return this.save()
}

// Method to update quiz results with dynamic limits
userSchema.methods.updateQuizResults = function (score, recommendations) {
  this.quizResults.push({
    score,
    recommendations,
    completedAt: new Date(),
  })

  if (this.quizResults.length > userConfig.limits.quizResults) {
    this.quizResults = this.quizResults.slice(-userConfig.limits.quizResults)
  }

  if (userConfig.features.enableUserStats) {
    this.stats.quizScore = Math.max(this.stats.quizScore || 0, score)
  }

  return this.save()
}

// Enhanced transform output with configurable fields
userSchema.methods.toJSON = function () {
  const user = this.toObject()

  // Remove sensitive fields
  const sensitiveFields = process.env.USER_SENSITIVE_FIELDS?.split(',') ||
    ['password', 'emailVerificationToken', 'emailVerificationExpires',
      'passwordResetToken', 'passwordResetExpires']

  sensitiveFields.forEach(field => {
    delete user[field]
  })

  return user
}

module.exports = mongoose.model("User", userSchema)
