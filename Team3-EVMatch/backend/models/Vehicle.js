const mongoose = require("mongoose")

// Configuration object - can be loaded from environment or config service
const vehicleConfig = {
  validation: {
    year: {
      min: parseInt(process.env.VEHICLE_YEAR_MIN) || 2010,
      maxYearsInFuture: parseInt(process.env.VEHICLE_MAX_YEARS_FUTURE) || 2
    },
    price: {
      minMsrp: parseInt(process.env.VEHICLE_MIN_PRICE) || 0
    },
    ratings: {
      min: parseInt(process.env.RATING_MIN) || 0,
      max: parseInt(process.env.RATING_MAX) || 5
    },
    scores: {
      min: parseInt(process.env.SCORE_MIN) || 0,
      max: parseInt(process.env.SCORE_MAX) || 100,
      defaultEcoScore: parseInt(process.env.DEFAULT_ECO_SCORE) || 85,
      defaultTechScore: parseInt(process.env.DEFAULT_TECH_SCORE) || 75
    }
  },
  enums: {
    bodyTypes: process.env.BODY_TYPES?.split(',') || 
      ["sedan", "suv", "hatchback", "coupe", "truck", "wagon", "convertible"],
    batteryChemistry: process.env.BATTERY_CHEMISTRY_TYPES?.split(',') || 
      ["LFP", "NCM", "NCA", "LTO"],
    chargePorts: process.env.CHARGE_PORT_TYPES?.split(',') || 
      ["CCS", "CHAdeMO", "Tesla", "Type2"],
    drivetrains: process.env.DRIVETRAIN_TYPES?.split(',') || 
      ["FWD", "RWD", "AWD"],
    imageTypes: process.env.IMAGE_TYPES?.split(',') || 
      ["exterior", "interior", "detail"],
    availabilityStatus: process.env.AVAILABILITY_STATUS?.split(',') || 
      ["available", "coming_soon", "discontinued"]
  },
  defaults: {
    federalIncentive: parseInt(process.env.DEFAULT_FEDERAL_INCENTIVE) || 0,
    stateIncentive: parseInt(process.env.DEFAULT_STATE_INCENTIVE) || 0,
    localIncentive: parseInt(process.env.DEFAULT_LOCAL_INCENTIVE) || 0,
    batteryWarrantyYears: parseInt(process.env.DEFAULT_BATTERY_WARRANTY_YEARS) || 8,
    batteryWarrantyMiles: parseInt(process.env.DEFAULT_BATTERY_WARRANTY_MILES) || 100000,
    expectedDeliveryWeeks: parseInt(process.env.DEFAULT_DELIVERY_WEEKS) || 4,
    initialViews: parseInt(process.env.INITIAL_VIEWS) || 0,
    initialFavorites: parseInt(process.env.INITIAL_FAVORITES) || 0,
    initialComparisons: parseInt(process.env.INITIAL_COMPARISONS) || 0
  },
  matchScoring: {
    budgetWeight: parseInt(process.env.BUDGET_MATCH_WEIGHT) || 30,
    typeWeight: parseInt(process.env.TYPE_MATCH_WEIGHT) || 25,
    rangeWeight: parseInt(process.env.RANGE_MATCH_WEIGHT) || 20,
    techWeight: parseInt(process.env.TECH_MATCH_WEIGHT) || 15,
    ecoWeight: parseInt(process.env.ECO_MATCH_WEIGHT) || 10,
    rangeBaselineEpa: parseInt(process.env.RANGE_BASELINE_EPA) || 300
  },
  features: {
    enableViewTracking: process.env.ENABLE_VIEW_TRACKING !== 'false',
    enableExternalValidation: process.env.ENABLE_EXTERNAL_VEHICLE_VALIDATION === 'true',
    enablePriceUpdates: process.env.ENABLE_PRICE_UPDATES === 'true',
    enableMatchScoring: process.env.ENABLE_MATCH_SCORING !== 'false'
  }
}

// Dynamic year validation
const getCurrentMaxYear = () => new Date().getFullYear() + vehicleConfig.validation.year.maxYearsInFuture

// Dynamic feature arrays schema
const createFeatureArraysSchema = () => {
  const featureTypes = process.env.FEATURE_TYPES?.split(',') || 
    ['standard', 'optional', 'safety', 'technology', 'comfort']
  
  const schema = {}
  featureTypes.forEach(type => {
    schema[type] = [String]
  })
  return schema
}

// Dynamic ratings schema
const createRatingsSchema = () => {
  const ratingCategories = process.env.RATING_CATEGORIES?.split(',') || 
    ['overall', 'range', 'charging', 'technology', 'comfort', 'value']
  
  const schema = { review_count: { type: Number, default: 0 } }
  ratingCategories.forEach(category => {
    schema[category] = {
      type: Number,
      min: vehicleConfig.validation.ratings.min,
      max: vehicleConfig.validation.ratings.max,
      default: vehicleConfig.validation.ratings.min
    }
  })
  return schema
}

const vehicleSchema = new mongoose.Schema(
  {
    make: {
      type: String,
      required: [true, "Vehicle make is required"],
      trim: true,
    },
    model: {
      type: String,
      required: [true, "Vehicle model is required"],
      trim: true,
    },
    year: {
      type: Number,
      required: [true, "Vehicle year is required"],
      min: [
        vehicleConfig.validation.year.min, 
        `Year must be ${vehicleConfig.validation.year.min} or later`
      ],
      max: [
        getCurrentMaxYear, 
        `Year cannot be more than ${vehicleConfig.validation.year.maxYearsInFuture} years in the future`
      ],
    },
    price: {
      msrp: {
        type: Number,
        required: [true, "MSRP is required"],
        min: [vehicleConfig.validation.price.minMsrp, "Price cannot be negative"],
      },
      incentives: {
        federal: { type: Number, default: vehicleConfig.defaults.federalIncentive },
        state: { type: Number, default: vehicleConfig.defaults.stateIncentive },
        local: { type: Number, default: vehicleConfig.defaults.localIncentive },
      },
    },
    specifications: {
      range: {
        epa: { type: Number, required: true },
        wltp: { type: Number },
        real_world: { type: Number },
      },
      efficiency: {
        mpge_city: { type: Number, required: true },
        mpge_highway: { type: Number, required: true },
        mpge_combined: { type: Number, required: true },
        kwh_per_100mi: { type: Number, required: true },
      },
      battery: {
        capacity_kwh: { type: Number, required: true },
        chemistry: { 
          type: String, 
          enum: {
            values: vehicleConfig.enums.batteryChemistry,
            message: `Battery chemistry must be one of: ${vehicleConfig.enums.batteryChemistry.join(', ')}`
          }
        },
        warranty_years: { type: Number, default: vehicleConfig.defaults.batteryWarrantyYears },
        warranty_miles: { type: Number, default: vehicleConfig.defaults.batteryWarrantyMiles },
      },
      charging: {
        ac_max_kw: { type: Number, required: true },
        dc_max_kw: { type: Number, required: true },
        charge_port: { 
          type: String, 
          enum: {
            values: vehicleConfig.enums.chargePorts,
            message: `Charge port must be one of: ${vehicleConfig.enums.chargePorts.join(', ')}`
          }
        },
        time_10_80_minutes: { type: Number },
      },
      performance: {
        acceleration_0_60: { type: Number },
        top_speed_mph: { type: Number },
        horsepower: { type: Number },
        torque_lb_ft: { type: Number },
        drivetrain: { 
          type: String, 
          enum: {
            values: vehicleConfig.enums.drivetrains,
            message: `Drivetrain must be one of: ${vehicleConfig.enums.drivetrains.join(', ')}`
          }
        },
      },
      dimensions: {
        length_inches: { type: Number },
        width_inches: { type: Number },
        height_inches: { type: Number },
        wheelbase_inches: { type: Number },
        ground_clearance_inches: { type: Number },
        cargo_volume_cubic_feet: { type: Number },
        seating_capacity: { type: Number, required: true },
      },
    },
    bodyType: {
      type: String,
      required: true,
      enum: {
        values: vehicleConfig.enums.bodyTypes,
        message: `Body type must be one of: ${vehicleConfig.enums.bodyTypes.join(', ')}`
      },
    },
    features: createFeatureArraysSchema(),
    images: [
      {
        url: { type: String, required: true },
        alt: String,
        type: { 
          type: String, 
          enum: {
            values: vehicleConfig.enums.imageTypes,
            message: `Image type must be one of: ${vehicleConfig.enums.imageTypes.join(', ')}`
          },
          default: vehicleConfig.enums.imageTypes[0] || "exterior" 
        },
      },
    ],
    availability: {
      status: {
        type: String,
        enum: {
          values: vehicleConfig.enums.availabilityStatus,
          message: `Status must be one of: ${vehicleConfig.enums.availabilityStatus.join(', ')}`
        },
        default: vehicleConfig.enums.availabilityStatus[0] || "available",
      },
      regions: [String],
      expected_delivery_weeks: { type: Number, default: vehicleConfig.defaults.expectedDeliveryWeeks },
    },
    ratings: createRatingsSchema(),
    ecoScore: {
      type: Number,
      min: vehicleConfig.validation.scores.min,
      max: vehicleConfig.validation.scores.max,
      default: vehicleConfig.validation.scores.defaultEcoScore,
    },
    techScore: {
      type: Number,
      min: vehicleConfig.validation.scores.min,
      max: vehicleConfig.validation.scores.max,
      default: vehicleConfig.validation.scores.defaultTechScore,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      views: { type: Number, default: vehicleConfig.defaults.initialViews },
      favorites: { type: Number, default: vehicleConfig.defaults.initialFavorites },
      comparisons: { type: Number, default: vehicleConfig.defaults.initialComparisons },
      lastUpdated: { type: Date, default: Date.now },
      externalId: String,
      sourceApi: String,
      lastSyncedAt: Date
    },
  },
  {
    timestamps: true,
  },
)

// Dynamic indexing
vehicleSchema.index({ make: 1, model: 1, year: 1 })
vehicleSchema.index({ bodyType: 1 })
vehicleSchema.index({ "price.msrp": 1 })
vehicleSchema.index({ "specifications.range.epa": 1 })
vehicleSchema.index({ "ratings.overall": -1 })
vehicleSchema.index({ isActive: 1 })

// Additional indexes from environment
const additionalIndexes = process.env.VEHICLE_ADDITIONAL_INDEXES?.split(',') || []
additionalIndexes.forEach(indexField => {
  if (indexField.trim()) {
    vehicleSchema.index({ [indexField.trim()]: 1 })
  }
})

// API integration for external validation
vehicleSchema.pre('save', async function(next) {
  if (vehicleConfig.features.enableExternalValidation && this.isNew) {
    try {
      const validationResponse = await fetch(process.env.VEHICLE_VALIDATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          make: this.make,
          model: this.model,
          year: this.year,
          specifications: this.specifications
        })
      })

      if (!validationResponse.ok) {
        const error = await validationResponse.json()
        throw new Error(`External vehicle validation failed: ${error.message}`)
      }

      const validationResult = await validationResponse.json()
      if (validationResult.suggestions) {
        Object.assign(this, validationResult.suggestions)
      }
    } catch (error) {
      console.error('External vehicle validation error:', error)
      if (process.env.STRICT_VEHICLE_VALIDATION === 'true') {
        return next(error)
      }
    }
  }
  next()
})

// Price update middleware with API integration
vehicleSchema.pre('save', async function(next) {
  if (vehicleConfig.features.enablePriceUpdates && this.isModified('price.msrp')) {
    try {
      const priceUpdateResponse = await fetch(process.env.PRICE_TRACKING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          vehicleId: this._id,
          make: this.make,
          model: this.model,
          year: this.year,
          oldPrice: this._original?.price?.msrp,
          newPrice: this.price.msrp,
          timestamp: new Date().toISOString()
        })
      })

      if (priceUpdateResponse.ok) {
        const priceData = await priceUpdateResponse.json()
        if (priceData.incentives) {
          Object.assign(this.price.incentives, priceData.incentives)
        }
      }
    } catch (error) {
      console.error('Price tracking API error:', error)
    }
  }
  next()
})

// Virtual for effective price after incentives
vehicleSchema.virtual("effectivePrice").get(function () {
  const totalIncentives = this.price.incentives.federal + 
                         this.price.incentives.state + 
                         this.price.incentives.local
  return Math.max(0, this.price.msrp - totalIncentives)
})

// Virtual for full name
vehicleSchema.virtual("fullName").get(function () {
  return `${this.year} ${this.make} ${this.model}`
})

// Method to increment view count with API integration
vehicleSchema.methods.incrementViews = async function () {
  if (!vehicleConfig.features.enableViewTracking) return this

  this.metadata.views += 1
  this.metadata.lastUpdated = new Date()

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
          event: 'vehicle_viewed',
          vehicleId: this._id,
          make: this.make,
          model: this.model,
          year: this.year,
          timestamp: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Analytics API error:', error)
    }
  }

  return this.save()
}

// Enhanced method to calculate match score with configurable weights
vehicleSchema.methods.calculateMatchScore = function (userPreferences) {
  if (!vehicleConfig.features.enableMatchScoring) return 0

  let score = 0

  // Budget matching (configurable weight)
  const effectivePrice = this.effectivePrice
  if (effectivePrice >= userPreferences.budget.min && effectivePrice <= userPreferences.budget.max) {
    score += vehicleConfig.matchScoring.budgetWeight
  } else if (effectivePrice < userPreferences.budget.min) {
    score += vehicleConfig.matchScoring.budgetWeight * 0.67 // Good value
  }

  // Vehicle type matching (configurable weight)
  if (this.bodyType === userPreferences.vehicleType) {
    score += vehicleConfig.matchScoring.typeWeight
  }

  // Range importance (configurable weight)
  const rangeScore = Math.min(
    (this.specifications.range.epa / vehicleConfig.matchScoring.rangeBaselineEpa) * 
    userPreferences.rangeImportance * 
    (vehicleConfig.matchScoring.rangeWeight / 10), 
    vehicleConfig.matchScoring.rangeWeight
  )
  score += rangeScore

  // Technology importance (configurable weight)
  const techScore = (this.techScore / vehicleConfig.validation.scores.max) * 
                   userPreferences.techImportance * 
                   (vehicleConfig.matchScoring.techWeight / 10)
  score += techScore

  // Eco-friendliness (configurable weight)
  score += (this.ecoScore / vehicleConfig.validation.scores.max) * vehicleConfig.matchScoring.ecoWeight

  return Math.round(score)
}

// Method to sync with external data source
vehicleSchema.methods.syncWithExternalApi = async function() {
  if (!process.env.EXTERNAL_VEHICLE_DATA_API_URL) return

  try {
    const response = await fetch(`${process.env.EXTERNAL_VEHICLE_DATA_API_URL}/${this.make}/${this.model}/${this.year}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const externalData = await response.json()
      
      // Update fields based on external data
      if (externalData.specifications) {
        Object.assign(this.specifications, externalData.specifications)
      }
      if (externalData.price) {
        Object.assign(this.price, externalData.price)
      }
      if (externalData.features) {
        Object.assign(this.features, externalData.features)
      }

      this.metadata.lastSyncedAt = new Date()
      this.metadata.sourceApi = 'external'
      
      await this.save()
    }
  } catch (error) {
    console.error('External API sync error:', error)
  }
}

// Static method to bulk update from external API
vehicleSchema.statics.bulkSyncWithExternalApi = async function(filters = {}) {
  const vehicles = await this.find(filters)
  
  for (const vehicle of vehicles) {
    await vehicle.syncWithExternalApi()
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// Method to update availability status
vehicleSchema.methods.updateAvailability = async function(status, regions) {
  this.availability.status = status
  if (regions) {
    this.availability.regions = regions
  }
  this.metadata.lastUpdated = new Date()

  // API call to notify availability change
  if (process.env.AVAILABILITY_NOTIFICATION_API_URL) {
    try {
      await fetch(process.env.AVAILABILITY_NOTIFICATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
        },
        body: JSON.stringify({
          vehicleId: this._id,
          fullName: this.fullName,
          status: status,
          regions: regions,
          timestamp: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Availability notification API error:', error)
    }
  }

  return this.save()
}

module.exports = mongoose.model("Vehicle", vehicleSchema)
