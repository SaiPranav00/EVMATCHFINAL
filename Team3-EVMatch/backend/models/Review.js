const mongoose = require("mongoose")

// Configuration object - can be loaded from environment or config service
const reviewConfig = {
  ratings: {
    min: parseInt(process.env.RATING_MIN) || 1,
    max: parseInt(process.env.RATING_MAX) || 5,
    categories: process.env.RATING_CATEGORIES?.split(',') || 
      ['overall', 'range', 'charging', 'technology', 'comfort', 'value']
  },
  validation: {
    title: {
      required: process.env.TITLE_REQUIRED !== 'false',
      maxLength: parseInt(process.env.TITLE_MAX_LENGTH) || 100
    },
    content: {
      required: process.env.CONTENT_REQUIRED !== 'false',
      minLength: parseInt(process.env.CONTENT_MIN_LENGTH) || 50,
      maxLength: parseInt(process.env.CONTENT_MAX_LENGTH) || 2000
    },
    prosConsLength: parseInt(process.env.PROS_CONS_MAX_LENGTH) || 200
  },
  usageTypes: process.env.USAGE_TYPES?.split(',') || 
    ["daily_commute", "weekend_trips", "long_distance", "city_driving", "mixed"],
  models: {
    user: process.env.USER_MODEL_NAME || "User",
    vehicle: process.env.VEHICLE_MODEL_NAME || "Vehicle"
  },
  features: {
    enableDuplicateCheck: process.env.ENABLE_DUPLICATE_CHECK !== 'false',
    enableAutoCalculation: process.env.ENABLE_AUTO_CALCULATION !== 'false',
    enableExternalValidation: process.env.ENABLE_EXTERNAL_VALIDATION === 'true'
  }
}

// Dynamic rating validation function
const createRatingValidator = (isRequired = false) => {
  const validator = {
    type: Number,
    min: [reviewConfig.ratings.min, `Rating must be at least ${reviewConfig.ratings.min}`],
    max: [reviewConfig.ratings.max, `Rating cannot exceed ${reviewConfig.ratings.max}`]
  }
  if (isRequired) {
    validator.required = [true, "Overall rating is required"]
  }
  return validator
}

// Dynamic ratings schema builder
const buildRatingsSchema = () => {
  const ratingsSchema = {}
  reviewConfig.ratings.categories.forEach(category => {
    ratingsSchema[category] = createRatingValidator(category === 'overall')
  })
  return ratingsSchema
}

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: reviewConfig.models.user,
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: reviewConfig.models.vehicle,
      required: true,
    },
    ratings: buildRatingsSchema(),
    title: {
      type: String,
      required: reviewConfig.validation.title.required ? 
        [true, "Review title is required"] : false,
      trim: true,
      maxlength: [
        reviewConfig.validation.title.maxLength, 
        `Title cannot exceed ${reviewConfig.validation.title.maxLength} characters`
      ],
    },
    content: {
      type: String,
      required: reviewConfig.validation.content.required ? 
        [true, "Review content is required"] : false,
      trim: true,
      minlength: [
        reviewConfig.validation.content.minLength, 
        `Review must be at least ${reviewConfig.validation.content.minLength} characters`
      ],
      maxlength: [
        reviewConfig.validation.content.maxLength, 
        `Review cannot exceed ${reviewConfig.validation.content.maxLength} characters`
      ],
    },
    pros: [
      {
        type: String,
        trim: true,
        maxlength: [
          reviewConfig.validation.prosConsLength, 
          `Pro cannot exceed ${reviewConfig.validation.prosConsLength} characters`
        ],
      },
    ],
    cons: [
      {
        type: String,
        trim: true,
        maxlength: [
          reviewConfig.validation.prosConsLength, 
          `Con cannot exceed ${reviewConfig.validation.prosConsLength} characters`
        ],
      },
    ],
    ownership: {
      duration_months: {
        type: Number,
        min: [0, "Duration cannot be negative"],
      },
      mileage: {
        type: Number,
        min: [0, "Mileage cannot be negative"],
      },
      usage_type: {
        type: String,
        enum: {
          values: reviewConfig.usageTypes,
          message: `Usage type must be one of: ${reviewConfig.usageTypes.join(', ')}`
        }
      },
    },
    verified: {
      type: Boolean,
      default: false,
    },
    helpful_votes: {
      type: Number,
      default: 0,
    },
    reported: {
      type: Boolean,
      default: false,
    },
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
  },
)

// Dynamic indexing
reviewSchema.index({ vehicle: 1, createdAt: -1 })
reviewSchema.index({ user: 1 })
reviewSchema.index({ verified: 1 })

reviewConfig.ratings.categories.forEach(category => {
  reviewSchema.index({ [`ratings.${category}`]: -1 })
})

if (reviewConfig.features.enableDuplicateCheck) {
  reviewSchema.index({ user: 1, vehicle: 1 }, { unique: true })
}

// Dynamic virtual for average rating
reviewSchema.virtual("averageRating").get(function () {
  const ratings = this.ratings
  const ratingValues = reviewConfig.ratings.categories
    .map(category => ratings[category])
    .filter(rating => rating != null)
  return ratingValues.length > 0 ? 
    ratingValues.reduce((sum, rating) => sum + rating, 0) / ratingValues.length : 0
})

// API integration for external validation
reviewSchema.pre('save', async function(next) {
  if (reviewConfig.features.enableExternalValidation && this.isNew) {
    try {
      const validationResponse = await fetch(process.env.REVIEW_VALIDATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          userId: this.user,
          vehicleId: this.vehicle,
          content: this.content,
          ratings: this.ratings
        })
      })
      if (!validationResponse.ok) {
        const error = await validationResponse.json()
        throw new Error(`External validation failed: ${error.message}`)
      }
      const validationResult = await validationResponse.json()
      if (validationResult.flagged) {
        this.reported = true
        this.metadata.set('validationFlags', validationResult.flags)
      }
    } catch (error) {
      console.error('External validation error:', error)
    }
  }
  next()
})

// Enhanced static method with API integration
reviewSchema.statics.calculateVehicleRatings = async function (vehicleId) {
  if (!reviewConfig.features.enableAutoCalculation) return

  const VehicleModel = mongoose.model(reviewConfig.models.vehicle)
  const pipeline = [
    { $match: { vehicle: vehicleId, isActive: true } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        ...reviewConfig.ratings.categories.reduce((acc, category) => {
          acc[category] = { $avg: `$ratings.${category}` }
          return acc
        }, {})
      },
    },
  ]

  const stats = await this.aggregate(pipeline)
  if (stats.length > 0) {
    const ratings = stats[0]
    const updateData = { "ratings.review_count": ratings.count }
    
    reviewConfig.ratings.categories.forEach(category => {
      if (ratings[category] != null) {
        updateData[`ratings.${category}`] = Math.round(ratings[category] * 10) / 10
      }
    })

    await VehicleModel.findByIdAndUpdate(vehicleId, updateData)

    // API call to external analytics service
    if (process.env.ANALYTICS_API_URL) {
      try {
        await fetch(process.env.ANALYTICS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
          },
          body: JSON.stringify({
            event: 'vehicle_ratings_updated',
            vehicleId: vehicleId,
            ratings: updateData,
            timestamp: new Date().toISOString()
          })
        })
      } catch (error) {
        console.error('Analytics API error:', error)
      }
    }
  }
}

// Enhanced middleware with API integration
if (reviewConfig.features.enableAutoCalculation) {
  reviewSchema.post("save", async function () {
    await this.constructor.calculateVehicleRatings(this.vehicle)
    
    if (process.env.NOTIFICATION_API_URL) {
      try {
        await fetch(process.env.NOTIFICATION_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
          },
          body: JSON.stringify({
            type: 'new_review',
            userId: this.user,
            vehicleId: this.vehicle,
            reviewId: this._id,
            ratings: this.ratings
          })
        })
      } catch (error) {
        console.error('Notification API error:', error)
      }
    }
  })

  reviewSchema.post("remove", async function () {
    await this.constructor.calculateVehicleRatings(this.vehicle)
  })

  reviewSchema.post("findOneAndUpdate", async function (doc) {
    if (doc) {
      await doc.constructor.calculateVehicleRatings(doc.vehicle)
    }
  })
}

// Dynamic instance methods
reviewSchema.methods.markHelpful = async function() {
  this.helpful_votes += 1
  await this.save()
  
  if (process.env.USER_REPUTATION_API_URL) {
    try {
      await fetch(process.env.USER_REPUTATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          userId: this.user,
          action: 'helpful_review',
          points: 1
        })
      })
    } catch (error) {
      console.error('Reputation API error:', error)
    }
  }
}

reviewSchema.methods.reportReview = async function(reason) {
  this.reported = true
  this.metadata.set('reportReason', reason)
  this.metadata.set('reportedAt', new Date())
  await this.save()
  
  if (process.env.MODERATION_API_URL) {
    try {
      await fetch(process.env.MODERATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          reviewId: this._id,
          reason: reason,
          content: this.content,
          priority: 'medium'
        })
      })
    } catch (error) {
      console.error('Moderation API error:', error)
    }
  }
}

module.exports = mongoose.model("Review", reviewSchema)
