const express = require("express")
const { body, validationResult } = require("express-validator")
const User = require("../models/User")
const Vehicle = require("../models/Vehicle")
const { auth } = require("../middleware/auth")

const router = express.Router()

// Configuration object - can be loaded from environment or config service
const quizConfig = {
  validation: {
    answers: {
      required: process.env.REQUIRED_QUIZ_ANSWERS?.split(',') || ['1', '2', '3', '4', '5', '8'],
      rangeImportance: {
        min: parseInt(process.env.RANGE_IMPORTANCE_MIN) || 1,
        max: parseInt(process.env.RANGE_IMPORTANCE_MAX) || 10
      },
      techImportance: {
        min: parseInt(process.env.TECH_IMPORTANCE_MIN) || 1,
        max: parseInt(process.env.TECH_IMPORTANCE_MAX) || 10
      }
    }
  },
  scoring: {
    budgetWeight: parseInt(process.env.BUDGET_SCORE_WEIGHT) || 30,
    typeWeight: parseInt(process.env.TYPE_SCORE_WEIGHT) || 25,
    rangeWeight: parseInt(process.env.RANGE_SCORE_WEIGHT) || 20,
    techWeight: parseInt(process.env.TECH_SCORE_WEIGHT) || 15,
    ecoWeight: parseInt(process.env.ECO_SCORE_WEIGHT) || 10,
    budgetFlexibility: parseFloat(process.env.BUDGET_FLEXIBILITY) || 1.2,
    rangeBaseline: parseInt(process.env.RANGE_BASELINE) || 300,
    overBudgetTolerance: parseFloat(process.env.OVER_BUDGET_TOLERANCE) || 1.1
  },
  recommendations: {
    maxVehicles: parseInt(process.env.MAX_RECOMMENDATION_VEHICLES) || 20,
    topRecommendations: parseInt(process.env.TOP_RECOMMENDATIONS_COUNT) || 5
  },
  mappings: {
    budget: process.env.BUDGET_MAPPINGS ? JSON.parse(process.env.BUDGET_MAPPINGS) : {
      "under-30k": { min: 0, max: 30000 },
      "30k-50k": { min: 30000, max: 50000 },
      "50k-70k": { min: 50000, max: 70000 },
      "70k-100k": { min: 70000, max: 100000 },
      "over-100k": { min: 100000, max: 500000 }
    },
    vehicleTypes: process.env.VEHICLE_TYPE_MAPPINGS ? JSON.parse(process.env.VEHICLE_TYPE_MAPPINGS) : {
      compact: "hatchback",
      sedan: "sedan",
      suv: "suv",
      truck: "truck",
      luxury: "sedan"
    },
    similarTypes: process.env.SIMILAR_TYPES_MAPPINGS ? JSON.parse(process.env.SIMILAR_TYPES_MAPPINGS) : {
      sedan: ["hatchback"],
      suv: ["wagon"],
      hatchback: ["sedan"],
      wagon: ["suv"]
    }
  },
  thresholds: {
    excellentRange: parseInt(process.env.EXCELLENT_RANGE_THRESHOLD) || 300,
    advancedTech: parseInt(process.env.ADVANCED_TECH_THRESHOLD) || 90,
    ecoFriendly: parseInt(process.env.ECO_FRIENDLY_THRESHOLD) || 90,
    fastCharging: parseInt(process.env.FAST_CHARGING_THRESHOLD) || 150
  },
  features: {
    enableExternalScoringAPI: process.env.ENABLE_EXTERNAL_SCORING_API === 'true',
    enableRecommendationLogging: process.env.ENABLE_RECOMMENDATION_LOGGING === 'true',
    enableMLRecommendations: process.env.ENABLE_ML_RECOMMENDATIONS === 'true',
    enableQuizAnalytics: process.env.ENABLE_QUIZ_ANALYTICS === 'true',
    enablePersonalization: process.env.ENABLE_PERSONALIZATION !== 'false'
  },
  messages: {
    validationFailed: process.env.VALIDATION_FAILED_MESSAGE || "Validation failed",
    quizCompleted: process.env.QUIZ_COMPLETED_MESSAGE || "Quiz completed successfully",
    processingError: process.env.QUIZ_PROCESSING_ERROR || "Failed to process quiz",
    historyError: process.env.QUIZ_HISTORY_ERROR || "Failed to fetch quiz history"
  }
}

// Dynamic validation rules builder
const createValidationRules = () => {
  const rules = [
    body("answers").isObject().withMessage("Answers must be an object")
  ]

  // Add dynamic required answer validations
  quizConfig.validation.answers.required.forEach(answerKey => {
    switch (answerKey) {
      case '4': // Range importance
        rules.push(
          body(`answers.${answerKey}`)
            .isInt({
              min: quizConfig.validation.answers.rangeImportance.min,
              max: quizConfig.validation.answers.rangeImportance.max
            })
            .withMessage(`Range importance must be ${quizConfig.validation.answers.rangeImportance.min}-${quizConfig.validation.answers.rangeImportance.max}`)
        )
        break
      case '8': // Tech importance
        rules.push(
          body(`answers.${answerKey}`)
            .isInt({
              min: quizConfig.validation.answers.techImportance.min,
              max: quizConfig.validation.answers.techImportance.max
            })
            .withMessage(`Tech importance must be ${quizConfig.validation.answers.techImportance.min}-${quizConfig.validation.answers.techImportance.max}`)
        )
        break
      default:
        rules.push(
          body(`answers.${answerKey}`).notEmpty().withMessage(`Answer ${answerKey} is required`)
        )
    }
  })

  return rules
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

// Dynamic answer processing function
function processQuizAnswers(answers) {
  const preferences = {}

  // Budget mapping
  if (answers[3] && quizConfig.mappings.budget[answers[3]]) {
    preferences.budget = quizConfig.mappings.budget[answers[3]]
  }

  // Vehicle type mapping
  if (answers[2] && quizConfig.mappings.vehicleTypes[answers[2]]) {
    preferences.vehicleType = quizConfig.mappings.vehicleTypes[answers[2]]
  }

  // Range and tech importance with dynamic keys
  Object.keys(answers).forEach(key => {
    const answerValue = answers[key]

    // Dynamic importance mapping
    if (key === '4' && answerValue) {
      preferences.rangeImportance = Number.parseInt(answerValue)
    }
    if (key === '8' && answerValue) {
      preferences.techImportance = Number.parseInt(answerValue)
    }

    // Dynamic feature arrays
    if (Array.isArray(answerValue)) {
      if (key === '6') {
        preferences.chargingFeatures = answerValue
      } else if (key === '7') {
        preferences.ecoFeatures = answerValue
      }
    }
  })

  // Additional preferences from environment configuration
  const additionalMappings = process.env.ADDITIONAL_ANSWER_MAPPINGS
  if (additionalMappings) {
    try {
      const mappings = JSON.parse(additionalMappings)
      Object.keys(mappings).forEach(answerKey => {
        if (answers[answerKey] && mappings[answerKey][answers[answerKey]]) {
          Object.assign(preferences, mappings[answerKey][answers[answerKey]])
        }
      })
    } catch (error) {
      console.error('Failed to parse additional answer mappings:', error)
    }
  }

  return preferences
}

// Dynamic vehicle recommendations function
async function getVehicleRecommendations(preferences, userId = null) {
  try {
    // Build filter based on preferences
    const filter = { isActive: true }

    // Budget filter with dynamic flexibility
    if (preferences.budget) {
      filter["price.msrp"] = {
        $gte: preferences.budget.min,
        $lte: preferences.budget.max * quizConfig.scoring.budgetFlexibility
      }
    }

    // Vehicle type filter with dynamic similar types
    const vehicleTypes = [preferences.vehicleType]
    if (quizConfig.mappings.similarTypes[preferences.vehicleType]) {
      vehicleTypes.push(...quizConfig.mappings.similarTypes[preferences.vehicleType])
    }
    filter.bodyType = { $in: vehicleTypes }

    // Additional filters from external API
    if (quizConfig.features.enableExternalScoringAPI) {
      const externalFilters = await callExternalAPI(process.env.RECOMMENDATION_FILTER_API_URL, {
        preferences,
        userId
      })
      if (externalFilters?.additionalFilters) {
        Object.assign(filter, externalFilters.additionalFilters)
      }
    }

    // Get vehicles with dynamic limit
    const vehicles = await Vehicle.find(filter).limit(quizConfig.recommendations.maxVehicles)

    // ML-based recommendations
    let mlRecommendations = null
    if (quizConfig.features.enableMLRecommendations) {
      mlRecommendations = await callExternalAPI(process.env.ML_RECOMMENDATION_API_URL, {
        preferences,
        vehicles: vehicles.map(v => v._id),
        userId
      })
    }

    // Calculate match scores and reasons
    const recommendations = await Promise.all(vehicles.map(async (vehicle) => {
      let score = calculateMatchScore(vehicle, preferences)
      let matchReasons = generateMatchReasons(vehicle, preferences)

      // Use ML score if available
      if (mlRecommendations?.scores?.[vehicle._id.toString()]) {
        score = mlRecommendations.scores[vehicle._id.toString()]
      }

      // External scoring API
      if (quizConfig.features.enableExternalScoringAPI) {
        const externalScore = await callExternalAPI(process.env.EXTERNAL_SCORING_API_URL, {
          vehicle: vehicle._id,
          preferences,
          currentScore: score
        })
        if (externalScore?.score) {
          score = externalScore.score
        }
        if (externalScore?.reasons) {
          matchReasons = [...matchReasons, ...externalScore.reasons]
        }
      }

      return {
        vehicle,
        score,
        matchReasons
      }
    }))

    // Sort by score and return top recommendations
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, quizConfig.recommendations.topRecommendations)
  } catch (error) {
    console.error("Get recommendations error:", error)
    return []
  }
}

// Dynamic match score calculation
function calculateMatchScore(vehicle, preferences) {
  let score = 0

  // Budget matching with configurable weight
  if (preferences.budget) {
    const effectivePrice = vehicle.price.msrp -
      (vehicle.price.incentives.federal + vehicle.price.incentives.state + vehicle.price.incentives.local)

    if (effectivePrice >= preferences.budget.min && effectivePrice <= preferences.budget.max) {
      score += quizConfig.scoring.budgetWeight
    } else if (effectivePrice < preferences.budget.min) {
      score += quizConfig.scoring.budgetWeight * 0.67 // Good value
    } else if (effectivePrice <= preferences.budget.max * quizConfig.scoring.overBudgetTolerance) {
      score += quizConfig.scoring.budgetWeight * 0.5 // Slightly over budget
    }
  }

  // Vehicle type matching with configurable weight
  if (vehicle.bodyType === preferences.vehicleType) {
    score += quizConfig.scoring.typeWeight
  } else if (quizConfig.mappings.similarTypes[preferences.vehicleType]?.includes(vehicle.bodyType)) {
    score += quizConfig.scoring.typeWeight * 0.6 // Similar type
  }

  // Range importance with configurable weight and baseline
  if (preferences.rangeImportance) {
    const rangeScore = Math.min(
      (vehicle.specifications.range.epa / quizConfig.scoring.rangeBaseline) *
      preferences.rangeImportance *
      (quizConfig.scoring.rangeWeight / 10),
      quizConfig.scoring.rangeWeight
    )
    score += rangeScore
  }

  // Technology importance with configurable weight
  if (preferences.techImportance) {
    const techScore = (vehicle.techScore / 100) *
      preferences.techImportance *
      (quizConfig.scoring.techWeight / 10)
    score += techScore
  }

  // Eco-friendliness with configurable weight
  score += (vehicle.ecoScore / 100) * quizConfig.scoring.ecoWeight

  return Math.round(score)
}

// Dynamic match reasons generation
function generateMatchReasons(vehicle, preferences) {
  const reasons = []

  // Budget reasons
  if (preferences.budget) {
    const effectivePrice = vehicle.price.msrp -
      (vehicle.price.incentives.federal + vehicle.price.incentives.state + vehicle.price.incentives.local)

    if (effectivePrice <= preferences.budget.max) {
      reasons.push("Within budget")
    }
    if (effectivePrice < preferences.budget.min) {
      reasons.push("Great value")
    }
  }

  // Vehicle type reasons
  if (vehicle.bodyType === preferences.vehicleType) {
    reasons.push("Perfect size match")
  }

  // Range reasons with configurable threshold
  if (vehicle.specifications.range.epa > quizConfig.thresholds.excellentRange) {
    reasons.push("Excellent range")
  }

  // Technology reasons with configurable threshold
  if (vehicle.techScore > quizConfig.thresholds.advancedTech) {
    reasons.push("Advanced technology")
  }

  // Eco reasons with configurable threshold
  if (vehicle.ecoScore > quizConfig.thresholds.ecoFriendly) {
    reasons.push("Eco-friendly")
  }

  // Charging reasons with configurable threshold
  if (preferences.chargingFeatures?.includes("fast-charging")) {
    if (vehicle.specifications.charging.dc_max_kw >= quizConfig.thresholds.fastCharging) {
      reasons.push("Fast charging")
    }
  }

  // Additional reasons from external API
  const additionalReasons = process.env.ADDITIONAL_MATCH_REASONS?.split(',') || []
  additionalReasons.forEach(reason => {
    const [condition, reasonText] = reason.split(':')
    if (condition && reasonText) {
      try {
        // Simple condition evaluation (can be extended)
        if (eval(`vehicle.${condition}`)) {
          reasons.push(reasonText.trim())
        }
      } catch (error) {
        console.error('Failed to evaluate additional reason condition:', error)
      }
    }
  })

  return reasons
}

// Submit quiz results and get recommendations
router.post("/submit", createValidationRules(), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: quizConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const { answers } = req.body
    const user = await User.findById(req.user.userId)

    // Process answers and update user preferences
    const preferences = processQuizAnswers(answers)

    // Personalization based on user history
    if (quizConfig.features.enablePersonalization && user.quizResults.length > 0) {
      const personalizedPrefs = await callExternalAPI(process.env.PERSONALIZATION_API_URL, {
        userId: user._id,
        currentPreferences: preferences,
        previousQuizResults: user.quizResults
      })

      if (personalizedPrefs?.adjustedPreferences) {
        Object.assign(preferences, personalizedPrefs.adjustedPreferences)
      }
    }

    // Update user preferences dynamically
    const preferencesToUpdate = process.env.PREFERENCE_UPDATE_FIELDS?.split(',') ||
      ['budget', 'vehicleType', 'rangeImportance', 'techImportance']

    preferencesToUpdate.forEach(field => {
      if (preferences[field] !== undefined) {
        user.preferences[field] = preferences[field]
      }
    })

    // Get vehicle recommendations
    const recommendations = await getVehicleRecommendations(preferences, user._id)

    // Save quiz results with configurable structure
    const quizResult = {
      answers,
      score: Math.round(recommendations.reduce((sum, rec) => sum + rec.score, 0) / recommendations.length),
      timestamp: new Date(),
      preferences
    }

    // Dynamic recommendation storage
    const recommendationFields = process.env.RECOMMENDATION_STORAGE_FIELDS?.split(',') ||
      ['vehicleId', 'score', 'matchReasons']

    quizResult.recommendations = recommendations.map((rec) => {
      const recommendation = {}
      if (recommendationFields.includes('vehicleId')) recommendation.vehicleId = rec.vehicle._id
      if (recommendationFields.includes('score')) recommendation.score = rec.score
      if (recommendationFields.includes('matchReasons')) recommendation.matchReasons = rec.matchReasons
      if (recommendationFields.includes('vehicle')) recommendation.vehicle = rec.vehicle
      return recommendation
    })

    user.quizResults.push(quizResult)
    await user.save()

    // Log quiz completion for analytics
    if (quizConfig.features.enableQuizAnalytics) {
      await callExternalAPI(process.env.QUIZ_ANALYTICS_API_URL, {
        event: 'quiz_completed',
        userId: user._id,
        answers,
        preferences,
        recommendationCount: recommendations.length,
        averageScore: quizResult.score,
        timestamp: new Date().toISOString()
      })
    }

    // Log recommendations
    if (quizConfig.features.enableRecommendationLogging) {
      await callExternalAPI(process.env.RECOMMENDATION_LOG_API_URL, {
        userId: user._id,
        preferences,
        recommendations: recommendations.map(r => ({
          vehicleId: r.vehicle._id,
          score: r.score,
          reasons: r.matchReasons
        })),
        timestamp: new Date().toISOString()
      })
    }

    // Build response dynamically
    const responseFields = process.env.QUIZ_RESPONSE_FIELDS?.split(',') ||
      ['recommendations', 'userPreferences']

    const responseData = {}
    if (responseFields.includes('recommendations')) {
      responseData.recommendations = recommendations
    }
    if (responseFields.includes('userPreferences')) {
      responseData.userPreferences = preferences
    }
    if (responseFields.includes('quizScore')) {
      responseData.quizScore = quizResult.score
    }
    if (responseFields.includes('personalizedInsights')) {
      responseData.personalizedInsights = await callExternalAPI(
        process.env.INSIGHTS_API_URL,
        { userId: user._id, preferences, recommendations }
      )
    }

    res.json({
      success: true,
      message: quizConfig.messages.quizCompleted,
      data: responseData,
    })
  } catch (error) {
    console.error("Quiz submission error:", error)

    // Log error to external service
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'quiz',
      endpoint: 'submit',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: quizConfig.messages.processingError,
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Get user's quiz history
router.get("/history", auth, async (req, res) => {
  try {
    // Dynamic populate fields
    const populateFields = process.env.QUIZ_HISTORY_POPULATE_FIELDS || "make model year price.msrp images"

    // Dynamic select fields
    const selectFields = process.env.QUIZ_HISTORY_SELECT_FIELDS || "quizResults"

    const user = await User.findById(req.user.userId)
      .populate(`quizResults.recommendations.vehicleId`, populateFields)
      .select(selectFields)

    // Filter quiz results based on configuration
    let quizHistory = user.quizResults

    // Limit history count
    const historyLimit = parseInt(process.env.QUIZ_HISTORY_LIMIT)
    if (historyLimit && quizHistory.length > historyLimit) {
      quizHistory = quizHistory.slice(-historyLimit)
    }

    // Add analytics to history
    if (quizConfig.features.enableQuizAnalytics) {
      const analyticsData = await callExternalAPI(process.env.QUIZ_HISTORY_ANALYTICS_API_URL, {
        userId: user._id,
        quizCount: quizHistory.length
      })

      if (analyticsData?.insights) {
        quizHistory = quizHistory.map(quiz => ({
          ...quiz.toObject(),
          insights: analyticsData.insights[quiz._id] || null
        }))
      }
    }

    // Build response dynamically
    const responseFields = process.env.HISTORY_RESPONSE_FIELDS?.split(',') || ['quizHistory']
    const responseData = {}

    if (responseFields.includes('quizHistory')) {
      responseData.quizHistory = quizHistory
    }
    if (responseFields.includes('summary')) {
      responseData.summary = {
        totalQuizzes: quizHistory.length,
        averageScore: quizHistory.reduce((sum, quiz) => sum + (quiz.score || 0), 0) / quizHistory.length,
        latestQuiz: quizHistory[quizHistory.length - 1]?.timestamp
      }
    }
    if (responseFields.includes('trends')) {
      responseData.trends = await callExternalAPI(process.env.QUIZ_TRENDS_API_URL, {
        userId: user._id,
        quizHistory
      })
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Get quiz history error:", error)

    // Log error to external service
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'quiz',
      endpoint: 'history',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: quizConfig.messages.historyError,
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Additional route: Get quiz insights
router.get("/insights", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('quizResults preferences')

    const insights = await callExternalAPI(process.env.QUIZ_INSIGHTS_API_URL, {
      userId: user._id,
      quizResults: user.quizResults,
      preferences: user.preferences
    })

    res.json({
      success: true,
      data: {
        insights: insights || {
          message: "No insights available",
          recommendations: []
        }
      }
    })
  } catch (error) {
    console.error("Get quiz insights error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch quiz insights",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    })
  }
})

module.exports = router
