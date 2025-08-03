const express = require("express")
const { query, param, body, validationResult } = require("express-validator")
const Vehicle = require("../models/Vehicle")
const { auth } = require("../middleware/auth")
const optionalAuth = require("../middleware/optionalAuth")

const router = express.Router()

// Configuration object - can be loaded from environment or config service
const vehicleConfig = {
  validation: {
    pagination: {
      minPage: parseInt(process.env.MIN_PAGE) || 1,
      minLimit: parseInt(process.env.MIN_LIMIT) || 1,
      maxLimit: parseInt(process.env.MAX_LIMIT) || 100,
      defaultLimit: parseInt(process.env.DEFAULT_LIMIT) || 20
    },
    price: {
      min: parseFloat(process.env.MIN_PRICE) || 0
    },
    range: {
      min: parseInt(process.env.MIN_RANGE) || 0
    }
  },
  enums: {
    bodyTypes: process.env.BODY_TYPES?.split(',') ||
      ["sedan", "suv", "hatchback", "coupe", "truck", "wagon", "convertible"],
    sortFields: process.env.SORT_FIELDS?.split(',') ||
      ["price", "range", "rating", "name", "year"],
    sortOrders: process.env.SORT_ORDERS?.split(',') || ["asc", "desc"]
  },
  defaults: {
    page: parseInt(process.env.DEFAULT_PAGE) || 1,
    sortBy: process.env.DEFAULT_SORT_BY || "name",
    sortOrder: process.env.DEFAULT_SORT_ORDER || "asc"
  },
  limits: {
    recommendationVehicles: parseInt(process.env.RECOMMENDATION_VEHICLES_LIMIT) || 10,
    topRecommendations: parseInt(process.env.TOP_RECOMMENDATIONS_LIMIT) || 5,
    popularVehicles: parseInt(process.env.POPULAR_VEHICLES_LIMIT) || 6
  },
  features: {
    enableViewTracking: process.env.ENABLE_VIEW_TRACKING !== 'false',
    enableMatchScoring: process.env.ENABLE_MATCH_SCORING !== 'false',
    enableFavorites: process.env.ENABLE_FAVORITES !== 'false',
    enableRecommendations: process.env.ENABLE_RECOMMENDATIONS !== 'false',
    enableAnalytics: process.env.ENABLE_VEHICLE_ANALYTICS === 'true',
    enableExternalRecommendations: process.env.ENABLE_EXTERNAL_RECOMMENDATIONS === 'true',
    enableSearchSuggestions: process.env.ENABLE_SEARCH_SUGGESTIONS === 'true'
  },
  messages: {
    validationFailed: process.env.VALIDATION_FAILED_MESSAGE || "Validation failed",
    vehicleNotFound: process.env.VEHICLE_NOT_FOUND_MESSAGE || "Vehicle not found",
    preferencesNotFound: process.env.PREFERENCES_NOT_FOUND_MESSAGE || "User preferences not found. Please complete the quiz first.",
    alreadyFavorited: process.env.ALREADY_FAVORITED_MESSAGE || "Vehicle already in favorites",
    notInFavorites: process.env.NOT_IN_FAVORITES_MESSAGE || "Vehicle not in favorites",
    addedToFavorites: process.env.ADDED_TO_FAVORITES_MESSAGE || "Vehicle added to favorites",
    removedFromFavorites: process.env.REMOVED_FROM_FAVORITES_MESSAGE || "Vehicle removed from favorites",
    fetchError: process.env.FETCH_ERROR_MESSAGE || "Failed to fetch vehicles"
  },
  search: {
    fields: process.env.SEARCH_FIELDS?.split(',') ||
      ['make', 'model', 'features.standard', 'features.optional'],
    enableFuzzySearch: process.env.ENABLE_FUZZY_SEARCH === 'true'
  }
}

// API integration helper
const callExternalAPI = async (endpoint, data, method = 'POST') => {
  if (!endpoint) return null

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
      },
      body: JSON.stringify(data)
    })

    if (response.ok) {
      return await response.json()
    }
  } catch (error) {
    console.error(`External API call failed for ${endpoint}:`, error)
  }
  return null
}

// Dynamic validation rules builder
const createValidationRules = (type) => {
  const rules = []

  switch (type) {
    case 'getVehicles':
      rules.push(
        query("page").optional()
          .isInt({ min: vehicleConfig.validation.pagination.minPage })
          .withMessage(`Page must be at least ${vehicleConfig.validation.pagination.minPage}`),
        query("limit").optional()
          .isInt({
            min: vehicleConfig.validation.pagination.minLimit,
            max: vehicleConfig.validation.pagination.maxLimit
          })
          .withMessage(`Limit must be between ${vehicleConfig.validation.pagination.minLimit} and ${vehicleConfig.validation.pagination.maxLimit}`),
        query("make").optional().isString().trim(),
        query("bodyType").optional().isIn(vehicleConfig.enums.bodyTypes)
          .withMessage(`Body type must be one of: ${vehicleConfig.enums.bodyTypes.join(', ')}`),
        query("minPrice").optional()
          .isFloat({ min: vehicleConfig.validation.price.min })
          .withMessage(`Min price must be at least ${vehicleConfig.validation.price.min}`),
        query("maxPrice").optional()
          .isFloat({ min: vehicleConfig.validation.price.min })
          .withMessage(`Max price must be at least ${vehicleConfig.validation.price.min}`),
        query("minRange").optional()
          .isInt({ min: vehicleConfig.validation.range.min })
          .withMessage(`Min range must be at least ${vehicleConfig.validation.range.min}`),
        query("maxRange").optional()
          .isInt({ min: vehicleConfig.validation.range.min })
          .withMessage(`Max range must be at least ${vehicleConfig.validation.range.min}`),
        query("sortBy").optional().isIn(vehicleConfig.enums.sortFields)
          .withMessage(`Sort field must be one of: ${vehicleConfig.enums.sortFields.join(', ')}`),
        query("sortOrder").optional().isIn(vehicleConfig.enums.sortOrders)
          .withMessage(`Sort order must be one of: ${vehicleConfig.enums.sortOrders.join(', ')}`)
      )
      break

    case 'getVehicleById':
    case 'addFavorite':
    case 'removeFavorite':
      rules.push(
        param("id").isMongoId().withMessage("Invalid vehicle ID")
      )
      break
  }

  return rules
}

// Build dynamic filter object
const buildSearchFilter = (queryParams) => {
  const {
    make, bodyType, minPrice, maxPrice, minRange, maxRange, search
  } = queryParams

  const filter = { isActive: true }

  // Make filter with fuzzy search option
  if (make) {
    if (vehicleConfig.search.enableFuzzySearch) {
      filter.make = { $regex: make, $options: 'i' }
    } else {
      filter.make = new RegExp(make, "i")
    }
  }

  // Body type filter
  if (bodyType && vehicleConfig.enums.bodyTypes.includes(bodyType)) {
    filter.bodyType = bodyType
  }

  // Price range filter
  if (minPrice || maxPrice) {
    filter["price.msrp"] = {}
    if (minPrice) filter["price.msrp"].$gte = Number.parseFloat(minPrice)
    if (maxPrice) filter["price.msrp"].$lte = Number.parseFloat(maxPrice)
  }

  // Range filter
  if (minRange || maxRange) {
    filter["specifications.range.epa"] = {}
    if (minRange) filter["specifications.range.epa"].$gte = Number.parseInt(minRange)
    if (maxRange) filter["specifications.range.epa"].$lte = Number.parseInt(maxRange)
  }

  // Search filter with dynamic fields
  if (search) {
    const searchConditions = vehicleConfig.search.fields.map(field => ({
      [field]: new RegExp(search, "i")
    }))
    filter.$or = searchConditions
  }

  // Additional filters from environment
  const additionalFilters = process.env.ADDITIONAL_VEHICLE_FILTERS
  if (additionalFilters) {
    try {
      const filters = JSON.parse(additionalFilters)
      Object.assign(filter, filters)
    } catch (error) {
      console.error('Failed to parse additional filters:', error)
    }
  }

  return filter
}

// Build dynamic sort object
const buildSortObject = (sortBy, sortOrder) => {
  const sort = {}
  const order = sortOrder === "desc" ? -1 : 1

  const sortMappings = process.env.SORT_MAPPINGS ? JSON.parse(process.env.SORT_MAPPINGS) : {
    price: "price.msrp",
    range: "specifications.range.epa",
    rating: "ratings.overall",
    year: "year",
    name: ["make", "model"]
  }

  const sortField = sortMappings[sortBy] || sortMappings.name

  if (Array.isArray(sortField)) {
    sortField.forEach(field => {
      sort[field] = order
    })
  } else {
    sort[sortField] = order
  }

  return sort
}

// Get all vehicles with filtering and pagination
router.get("/", createValidationRules('getVehicles'), async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const {
      page = vehicleConfig.defaults.page,
      limit = vehicleConfig.validation.pagination.defaultLimit,
      sortBy = vehicleConfig.defaults.sortBy,
      sortOrder = vehicleConfig.defaults.sortOrder,
      search,
    } = req.query

    // Build filter and sort objects dynamically
    const filter = buildSearchFilter(req.query)
    const sort = buildSortObject(sortBy, sortOrder)

    // Search suggestions API integration
    if (vehicleConfig.features.enableSearchSuggestions && search) {
      const suggestions = await callExternalAPI(process.env.SEARCH_SUGGESTIONS_API_URL, {
        query: search,
        filters: filter
      }, 'GET')

      if (suggestions?.enhancedQuery) {
        Object.assign(filter, suggestions.enhancedQuery)
      }
    }

    // Execute query with pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    // Dynamic select fields
    const excludeFields = process.env.VEHICLE_EXCLUDE_FIELDS?.split(',') || ["-metadata", "-__v"]
    const selectFields = excludeFields.join(' ')

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number.parseInt(limit))
        .select(selectFields),
      Vehicle.countDocuments(filter),
    ])

    const totalPages = Math.ceil(total / Number.parseInt(limit))

    // Log search analytics
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'vehicles_searched',
        query: req.query,
        resultCount: vehicles.length,
        totalCount: total,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })
    }

    // Build response dynamically
    const responseFields = process.env.VEHICLE_RESPONSE_FIELDS?.split(',') ||
      ['vehicles', 'pagination']

    const responseData = {}

    if (responseFields.includes('vehicles')) {
      responseData.vehicles = vehicles
    }
    if (responseFields.includes('pagination')) {
      responseData.pagination = {
        currentPage: Number.parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: Number.parseInt(limit),
        hasNextPage: Number.parseInt(page) < totalPages,
        hasPrevPage: Number.parseInt(page) > 1,
      }
    }
    if (responseFields.includes('filters')) {
      responseData.appliedFilters = req.query
    }
    if (responseFields.includes('suggestions') && search) {
      const suggestions = await callExternalAPI(process.env.SEARCH_SUGGESTIONS_API_URL, {
        query: search,
        resultCount: vehicles.length
      }, 'GET')
      responseData.suggestions = suggestions?.suggestions || []
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Get vehicles error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'getVehicles',
      error: error.message,
      query: req.query,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: vehicleConfig.messages.fetchError,
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Get vehicle by ID
router.get("/:id", createValidationRules('getVehicleById'), optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    let vehicle = await Vehicle.findById(req.params.id)

    if (!vehicle || !vehicle.isActive) {
      return res.status(404).json({
        success: false,
        message: vehicleConfig.messages.vehicleNotFound,
      })
    }

    // Sync with external API for real-time data
    if (process.env.EXTERNAL_VEHICLE_SYNC_API_URL) {
      try {
        await vehicle.syncWithExternalApi()
        vehicle = await Vehicle.findById(req.params.id)
      } catch (syncError) {
        console.error('External sync error:', syncError)
      }
    }

    // Increment view count
    if (vehicleConfig.features.enableViewTracking) {
      await vehicle.incrementViews()
    }

    // Calculate match score if user is authenticated
    let matchScore = null
    let matchReasons = []

    if (req.user && vehicleConfig.features.enableMatchScoring) {
      const User = require("../models/User")
      const user = await User.findById(req.user.userId)

      if (user && user.preferences) {
        matchScore = vehicle.calculateMatchScore(user.preferences)

        // Get match reasons from external API
        const matchAnalysis = await callExternalAPI(process.env.MATCH_ANALYSIS_API_URL, {
          userId: user._id,
          vehicleId: vehicle._id,
          preferences: user.preferences,
          vehicleSpecs: vehicle.specifications
        })

        if (matchAnalysis?.reasons) {
          matchReasons = matchAnalysis.reasons
        }
      }
    }

    // Get similar vehicles
    let similarVehicles = []
    if (process.env.SIMILAR_VEHICLES_API_URL) {
      const similarData = await callExternalAPI(process.env.SIMILAR_VEHICLES_API_URL, {
        vehicleId: vehicle._id,
        make: vehicle.make,
        bodyType: vehicle.bodyType,
        priceRange: vehicle.price.msrp,
        limit: parseInt(process.env.SIMILAR_VEHICLES_LIMIT) || 4
      }, 'GET')

      if (similarData?.vehicles) {
        similarVehicles = similarData.vehicles
      }
    }

    // Log vehicle view
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'vehicle_viewed',
        vehicleId: vehicle._id,
        userId: req.user?.userId,
        make: vehicle.make,
        model: vehicle.model,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })
    }

    // Build response dynamically
    const responseFields = process.env.VEHICLE_DETAIL_RESPONSE_FIELDS?.split(',') ||
      ['vehicle', 'matchScore']

    const responseData = {}

    if (responseFields.includes('vehicle')) {
      responseData.vehicle = vehicle
    }
    if (responseFields.includes('matchScore')) {
      responseData.matchScore = matchScore
    }
    if (responseFields.includes('matchReasons')) {
      responseData.matchReasons = matchReasons
    }
    if (responseFields.includes('similarVehicles')) {
      responseData.similarVehicles = similarVehicles
    }
    if (responseFields.includes('isFavorited') && req.user) {
      const User = require("../models/User")
      const user = await User.findById(req.user.userId)
      responseData.isFavorited = user?.favoriteVehicles?.some(fav =>
        fav.vehicleId?.toString() === vehicle._id.toString()
      ) || false
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Get vehicle error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'getVehicleById',
      vehicleId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: vehicleConfig.messages.fetchError,
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Get vehicle recommendations for user
router.get("/recommendations/for-me", auth, async (req, res) => {
  try {
    if (!vehicleConfig.features.enableRecommendations) {
      return res.status(404).json({
        success: false,
        message: "Recommendations are not enabled"
      })
    }

    const User = require("../models/User")
    const user = await User.findById(req.user.userId)

    if (!user || !user.preferences) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.preferencesNotFound,
      })
    }

    let recommendations = []

    // External recommendations API
    if (vehicleConfig.features.enableExternalRecommendations) {
      const externalRecs = await callExternalAPI(process.env.EXTERNAL_RECOMMENDATIONS_API_URL, {
        userId: user._id,
        preferences: user.preferences,
        limit: vehicleConfig.limits.recommendationVehicles
      }, 'GET')

      if (externalRecs?.recommendations) {
        recommendations = externalRecs.recommendations
      }
    }

    // Fallback to internal recommendations
    if (recommendations.length === 0) {
      // Build filter based on user preferences with dynamic flexibility
      const filter = { isActive: true }

      // Budget filter with configurable flexibility
      if (user.preferences.budget) {
        const budgetFlexibility = parseFloat(process.env.BUDGET_FLEXIBILITY) || 1.2
        filter["price.msrp"] = {
          $gte: user.preferences.budget.min,
          $lte: user.preferences.budget.max * budgetFlexibility,
        }
      }

      // Vehicle type filter with similar types
      if (user.preferences.vehicleType) {
        const similarTypes = process.env.SIMILAR_VEHICLE_TYPES ?
          JSON.parse(process.env.SIMILAR_VEHICLE_TYPES) : {
            sedan: ["hatchback"],
            suv: ["wagon"],
            hatchback: ["sedan"],
            wagon: ["suv"]
          }

        const typeOptions = [user.preferences.vehicleType]
        if (similarTypes[user.preferences.vehicleType]) {
          typeOptions.push(...similarTypes[user.preferences.vehicleType])
        }

        filter.bodyType = { $in: typeOptions }
      }

      // Get vehicles and calculate match scores
      const vehicles = await Vehicle.find(filter).limit(vehicleConfig.limits.recommendationVehicles)

      recommendations = vehicles
        .map((vehicle) => ({
          vehicle,
          matchScore: vehicle.calculateMatchScore(user.preferences),
          matchReasons: [], // Would be populated by external service
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, vehicleConfig.limits.topRecommendations)
    }

    // Enhanced recommendations with external insights
    if (process.env.RECOMMENDATION_INSIGHTS_API_URL) {
      const insights = await callExternalAPI(process.env.RECOMMENDATION_INSIGHTS_API_URL, {
        userId: user._id,
        recommendations: recommendations.map(r => r.vehicle?._id || r.vehicleId),
        preferences: user.preferences
      })

      if (insights?.enhancedRecommendations) {
        recommendations = insights.enhancedRecommendations
      }
    }

    // Log recommendation request
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'recommendations_requested',
        userId: user._id,
        preferences: user.preferences,
        recommendationCount: recommendations.length,
        timestamp: new Date().toISOString()
      })
    }

    // Build response dynamically
    const responseFields = process.env.RECOMMENDATION_RESPONSE_FIELDS?.split(',') ||
      ['recommendations', 'userPreferences']

    const responseData = {}

    if (responseFields.includes('recommendations')) {
      responseData.recommendations = recommendations
    }
    if (responseFields.includes('userPreferences')) {
      responseData.userPreferences = user.preferences
    }
    if (responseFields.includes('recommendationStrategy')) {
      responseData.recommendationStrategy = vehicleConfig.features.enableExternalRecommendations ?
        'external' : 'internal'
    }
    if (responseFields.includes('personalizedInsights')) {
      const insights = await callExternalAPI(process.env.PERSONALIZED_INSIGHTS_API_URL, {
        userId: user._id,
        recommendations
      })
      responseData.personalizedInsights = insights
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Get recommendations error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'getRecommendations',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to get recommendations",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Add vehicle to favorites
router.post("/:id/favorite", createValidationRules('addFavorite'), auth, async (req, res) => {
  try {
    if (!vehicleConfig.features.enableFavorites) {
      return res.status(404).json({
        success: false,
        message: "Favorites feature is not enabled"
      })
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const vehicleId = req.params.id

    // Check if vehicle exists
    const vehicle = await Vehicle.findById(vehicleId)
    if (!vehicle || !vehicle.isActive) {
      return res.status(404).json({
        success: false,
        message: vehicleConfig.messages.vehicleNotFound,
      })
    }

    const User = require("../models/User")
    const user = await User.findById(req.user.userId)

    // Check if already favorited using the User model method
    const isAlreadyFavorited = user.favoriteVehicles.some(fav =>
      fav.vehicleId?.toString() === vehicleId
    )

    if (isAlreadyFavorited) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.alreadyFavorited,
      })
    }

    // Add to favorites using User model method
    await user.addToFavorites(vehicleId)

    // Update vehicle favorites count
    vehicle.metadata.favorites += 1
    await vehicle.save()

    // External favorite tracking
    if (process.env.FAVORITE_TRACKING_API_URL) {
      await callExternalAPI(process.env.FAVORITE_TRACKING_API_URL, {
        userId: user._id,
        vehicleId,
        action: 'add',
        timestamp: new Date().toISOString()
      })
    }

    // Log favorite action
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'vehicle_favorited',
        userId: user._id,
        vehicleId,
        vehicleName: vehicle.fullName,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: vehicleConfig.messages.addedToFavorites,
    })
  } catch (error) {
    console.error("Add favorite error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'addFavorite',
      vehicleId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to add vehicle to favorites",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Remove vehicle from favorites
router.delete("/:id/favorite", createValidationRules('removeFavorite'), auth, async (req, res) => {
  try {
    if (!vehicleConfig.features.enableFavorites) {
      return res.status(404).json({
        success: false,
        message: "Favorites feature is not enabled"
      })
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const vehicleId = req.params.id

    const User = require("../models/User")
    const user = await User.findById(req.user.userId)

    // Check if in favorites
    const isInFavorites = user.favoriteVehicles.some(fav =>
      fav.vehicleId?.toString() === vehicleId
    )

    if (!isInFavorites) {
      return res.status(400).json({
        success: false,
        message: vehicleConfig.messages.notInFavorites,
      })
    }

    // Remove from favorites using User model method
    await user.removeFromFavorites(vehicleId)

    // Update vehicle favorites count
    const vehicle = await Vehicle.findById(vehicleId)
    if (vehicle) {
      const decrementValue = parseInt(process.env.FAVORITE_DECREMENT_VALUE) || 1
      vehicle.metadata.favorites = Math.max(0, vehicle.metadata.favorites - decrementValue)
      await vehicle.save()
    }

    // External favorite tracking
    if (process.env.FAVORITE_TRACKING_API_URL) {
      await callExternalAPI(process.env.FAVORITE_TRACKING_API_URL, {
        userId: user._id,
        vehicleId,
        action: 'remove',
        timestamp: new Date().toISOString()
      })
    }

    // Log unfavorite action
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'vehicle_unfavorited',
        userId: user._id,
        vehicleId,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: vehicleConfig.messages.removedFromFavorites,
    })
  } catch (error) {
    console.error("Remove favorite error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'removeFavorite',
      vehicleId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to remove vehicle from favorites",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Get popular vehicles
router.get("/popular/trending", async (req, res) => {
  try {
    let vehicles = []

    // External trending API
    if (process.env.TRENDING_VEHICLES_API_URL) {
      const trendingData = await callExternalAPI(
        process.env.TRENDING_VEHICLES_API_URL,
        { limit: vehicleConfig.limits.popularVehicles },
        'GET'
      )

      if (trendingData?.vehicles) {
        vehicles = trendingData.vehicles
      }
    }

    // Fallback to internal trending logic
    if (vehicles.length === 0) {
      // Dynamic sort criteria
      const sortCriteria = process.env.TRENDING_SORT_CRITERIA ?
        JSON.parse(process.env.TRENDING_SORT_CRITERIA) :
        { "metadata.views": -1, "ratings.overall": -1 }

      // Dynamic select fields
      const selectFields = process.env.TRENDING_SELECT_FIELDS ||
        "make model year price.msrp specifications.range.epa ratings images"

      vehicles = await Vehicle.find({ isActive: true })
        .sort(sortCriteria)
        .limit(vehicleConfig.limits.popularVehicles)
        .select(selectFields)
    }

    // Enhanced trending data
    if (process.env.TRENDING_ENHANCEMENT_API_URL) {
      const enhancements = await callExternalAPI(process.env.TRENDING_ENHANCEMENT_API_URL, {
        vehicles: vehicles.map(v => v._id)
      })

      if (enhancements?.enhancedVehicles) {
        vehicles = enhancements.enhancedVehicles
      }
    }

    // Log trending access
    if (vehicleConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.VEHICLE_ANALYTICS_API_URL, {
        event: 'trending_vehicles_accessed',
        vehicleCount: vehicles.length,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })
    }

    res.json({
      success: true,
      data: { vehicles },
    })
  } catch (error) {
    console.error("Get popular vehicles error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'vehicles',
      endpoint: 'getTrending',
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to fetch popular vehicles",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

module.exports = router
