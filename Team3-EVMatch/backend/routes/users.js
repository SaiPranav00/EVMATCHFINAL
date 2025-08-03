const express = require("express")
const { body, validationResult } = require("express-validator")
const User = require("../models/User")
const { auth } = require("../middleware/auth")

const router = express.Router()

// Configuration object - can be loaded from environment or config service
const userConfig = {
  validation: {
    name: {
      minLength: parseInt(process.env.NAME_MIN_LENGTH) || 2,
      maxLength: parseInt(process.env.NAME_MAX_LENGTH) || 50
    },
    email: {
      pattern: process.env.EMAIL_PATTERN || /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    }
  },
  features: {
    enableActivityTracking: process.env.ENABLE_ACTIVITY_TRACKING !== 'false',
    enableStatsCalculation: process.env.ENABLE_STATS_CALCULATION !== 'false',
    enableExternalStats: process.env.ENABLE_EXTERNAL_STATS === 'true',
    enableSoftDelete: process.env.ENABLE_SOFT_DELETE !== 'false',
    enableAnalytics: process.env.ENABLE_USER_ANALYTICS === 'true',
    enablePreferenceValidation: process.env.ENABLE_PREFERENCE_VALIDATION === 'true',
    enableEmailVerificationReset: process.env.ENABLE_EMAIL_VERIFICATION_RESET !== 'false'
  },
  messages: {
    validationFailed: process.env.VALIDATION_FAILED_MESSAGE || "Validation failed",
    userNotFound: process.env.USER_NOT_FOUND_MESSAGE || "User not found",
    profileUpdated: process.env.PROFILE_UPDATED_MESSAGE || "Profile updated successfully",
    preferencesUpdated: process.env.PREFERENCES_UPDATED_MESSAGE || "Preferences updated successfully",
    activityTracked: process.env.ACTIVITY_TRACKED_MESSAGE || "Activity tracked successfully",
    accountDeleted: process.env.ACCOUNT_DELETED_MESSAGE || "Account deleted successfully",
    emailExists: process.env.EMAIL_EXISTS_MESSAGE || "Email already exists",
    serverError: process.env.SERVER_ERROR_MESSAGE || "Server error"
  },
  activity: {
    types: process.env.ACTIVITY_TYPES?.split(',') ||
      ['view', 'favorite', 'compare', 'quiz', 'charging', 'search', 'download'],
    maxActivities: parseInt(process.env.MAX_ACTIVITY_ITEMS) || 50,
    colors: process.env.ACTIVITY_COLORS ? JSON.parse(process.env.ACTIVITY_COLORS) : {
      view: "green",
      favorite: "blue",
      compare: "purple",
      quiz: "orange",
      charging: "green",
      search: "teal",
      download: "indigo"
    },
    icons: process.env.ACTIVITY_ICONS ? JSON.parse(process.env.ACTIVITY_ICONS) : {
      view: "fas fa-eye",
      favorite: "fas fa-heart",
      compare: "fas fa-balance-scale",
      quiz: "fas fa-question-circle",
      charging: "fas fa-bolt",
      search: "fas fa-search",
      download: "fas fa-download"
    }
  },
  stats: {
    randomRange: {
      viewed: { min: parseInt(process.env.VIEWED_MIN) || 10, max: parseInt(process.env.VIEWED_MAX) || 60 },
      favorites: { min: parseInt(process.env.FAVORITES_MIN) || 1, max: parseInt(process.env.FAVORITES_MAX) || 15 },
      comparisons: { min: parseInt(process.env.COMPARISONS_MIN) || 3, max: parseInt(process.env.COMPARISONS_MAX) || 20 },
      quizScore: { min: parseInt(process.env.QUIZ_SCORE_MIN) || 70, max: parseInt(process.env.QUIZ_SCORE_MAX) || 100 }
    }
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
    case 'updateProfile':
      rules.push(
        body("firstName").optional().trim()
          .isLength({
            min: userConfig.validation.name.minLength,
            max: userConfig.validation.name.maxLength
          })
          .withMessage(`First name must be ${userConfig.validation.name.minLength}-${userConfig.validation.name.maxLength} characters`),
        body("lastName").optional().trim()
          .isLength({
            min: userConfig.validation.name.minLength,
            max: userConfig.validation.name.maxLength
          })
          .withMessage(`Last name must be ${userConfig.validation.name.minLength}-${userConfig.validation.name.maxLength} characters`),
        body("email").optional().isEmail().normalizeEmail().withMessage("Please provide a valid email")
      )
      break

    case 'trackActivity':
      rules.push(
        body("type").exists().withMessage("Activity type is required")
          .isIn(userConfig.activity.types)
          .withMessage(`Activity type must be one of: ${userConfig.activity.types.join(', ')}`),
        body("itemId").optional().isMongoId().withMessage("Invalid item ID")
      )
      break

    case 'updatePreferences':
      rules.push(
        body("preferences").isObject().withMessage("Preferences must be an object")
      )
      break
  }

  return rules
}

// Get user profile
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // Get additional profile data from external APIs
    let profileEnhancements = {}
    if (process.env.PROFILE_ENHANCEMENT_API_URL) {
      profileEnhancements = await callExternalAPI(
        process.env.PROFILE_ENHANCEMENT_API_URL,
        { userId: user._id },
        'GET'
      ) || {}
    }

    // Build response dynamically
    const profileFields = process.env.PROFILE_RESPONSE_FIELDS?.split(',') ||
      ['id', 'firstName', 'lastName', 'email', 'isEmailVerified', 'preferences', 'createdAt', 'lastLogin']

    const userResponse = {}
    profileFields.forEach(field => {
      switch (field) {
        case 'id':
          userResponse.id = user._id
          break
        case 'fullName':
          userResponse.fullName = `${user.firstName} ${user.lastName}`
          break
        case 'initials':
          userResponse.initials = user.initials
          break
        default:
          if (user[field] !== undefined) {
            userResponse[field] = user[field]
          }
      }
    })

    // Add enhancements from external API
    if (profileEnhancements.additionalData) {
      Object.assign(userResponse, profileEnhancements.additionalData)
    }

    // Log profile access
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'profile_accessed',
        userId: user._id,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
    }

    res.json({
      success: true,
      data: { user: userResponse },
    })
  } catch (error) {
    console.error("Get profile error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'getProfile',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Update user profile
router.put("/profile", createValidationRules('updateProfile'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: userConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // Dynamic field updates
    const updateableFields = process.env.PROFILE_UPDATEABLE_FIELDS?.split(',') ||
      ['firstName', 'lastName', 'email']

    const updateData = {}
    updateableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field]
      }
    })

    // Email change validation
    if (updateData.email && updateData.email !== user.email) {
      // External email validation
      if (process.env.EMAIL_VALIDATION_API_URL) {
        const emailValidation = await callExternalAPI(process.env.EMAIL_VALIDATION_API_URL, {
          email: updateData.email,
          userId: user._id
        })

        if (emailValidation?.blocked) {
          return res.status(400).json({
            success: false,
            message: emailValidation.reason || "Email not allowed"
          })
        }
      }

      const existingUser = await User.findOne({ email: updateData.email })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: userConfig.messages.emailExists,
        })
      }

      user.email = updateData.email
      if (userConfig.features.enableEmailVerificationReset) {
        user.isEmailVerified = false
      }
    }

    // Update other fields
    Object.keys(updateData).forEach(field => {
      if (field !== 'email' && user[field] !== undefined) {
        user[field] = updateData[field]
      }
    })

    await user.save()

    // External profile update notification
    if (process.env.PROFILE_UPDATE_WEBHOOK_URL) {
      await callExternalAPI(process.env.PROFILE_UPDATE_WEBHOOK_URL, {
        userId: user._id,
        updatedFields: Object.keys(updateData),
        timestamp: new Date().toISOString()
      })
    }

    // Log profile update
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'profile_updated',
        userId: user._id,
        updatedFields: Object.keys(updateData),
        timestamp: new Date().toISOString()
      })
    }

    // Build response
    const responseFields = process.env.PROFILE_UPDATE_RESPONSE_FIELDS?.split(',') ||
      ['id', 'firstName', 'lastName', 'email', 'isEmailVerified', 'preferences']

    const userResponse = {}
    responseFields.forEach(field => {
      switch (field) {
        case 'id':
          userResponse.id = user._id
          break
        default:
          if (user[field] !== undefined) {
            userResponse[field] = user[field]
          }
      }
    })

    res.json({
      success: true,
      message: userConfig.messages.profileUpdated,
      data: { user: userResponse },
    })
  } catch (error) {
    console.error("Update profile error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'updateProfile',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Get user statistics
router.get("/stats", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    let stats = {}

    if (userConfig.features.enableExternalStats) {
      // Get stats from external API
      const externalStats = await callExternalAPI(
        process.env.USER_STATS_API_URL,
        { userId: user._id },
        'GET'
      )

      if (externalStats) {
        stats = externalStats
      }
    }

    if (!stats || Object.keys(stats).length === 0) {
      if (userConfig.features.enableStatsCalculation && user.stats) {
        // Use actual user stats
        stats = {
          viewedCount: user.stats.viewedCount || 0,
          favoritesCount: user.stats.favoritesCount || 0,
          comparisonsCount: user.stats.comparisonsCount || 0,
          quizScore: user.stats.quizScore || 0,
        }
      } else {
        // Generate dynamic sample data based on configuration
        const ranges = userConfig.stats.randomRange
        stats = {
          viewedCount: Math.floor(Math.random() * (ranges.viewed.max - ranges.viewed.min + 1)) + ranges.viewed.min,
          favoritesCount: Math.floor(Math.random() * (ranges.favorites.max - ranges.favorites.min + 1)) + ranges.favorites.min,
          comparisonsCount: Math.floor(Math.random() * (ranges.comparisons.max - ranges.comparisons.min + 1)) + ranges.comparisons.min,
          quizScore: Math.floor(Math.random() * (ranges.quizScore.max - ranges.quizScore.min + 1)) + ranges.quizScore.min,
        }
      }
    }

    // Add computed stats from environment configuration
    const computedStats = process.env.COMPUTED_STATS?.split(',') || []
    computedStats.forEach(statType => {
      switch (statType) {
        case 'engagementScore':
          stats.engagementScore = Math.round(
            (stats.viewedCount * 0.1 + stats.favoritesCount * 0.3 + stats.comparisonsCount * 0.2 + stats.quizScore * 0.4) / 4
          )
          break
        case 'activityLevel':
          const totalActivity = stats.viewedCount + stats.favoritesCount + stats.comparisonsCount
          stats.activityLevel = totalActivity > 50 ? 'High' : totalActivity > 20 ? 'Medium' : 'Low'
          break
      }
    })

    // Log stats access
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'stats_accessed',
        userId: user._id,
        stats,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("Get stats error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'getStats',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Get user activity feed
router.get("/activity", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    let activities = []

    // Get activities from external API
    if (process.env.ACTIVITY_FEED_API_URL) {
      const externalActivities = await callExternalAPI(
        process.env.ACTIVITY_FEED_API_URL,
        { userId: user._id, limit: userConfig.activity.maxActivities },
        'GET'
      )

      if (externalActivities?.activities) {
        activities = externalActivities.activities
      }
    }

    // Fallback to sample data if no external activities
    if (activities.length === 0) {
      const sampleActivities = process.env.SAMPLE_ACTIVITIES ? JSON.parse(process.env.SAMPLE_ACTIVITIES) : [
        { type: "view", text: "Viewed Tesla Model 3", hours: 2 },
        { type: "favorite", text: "Added BMW i4 to favorites", days: 1 },
        { type: "compare", text: "Compared 3 vehicles", days: 2 },
        { type: "quiz", text: "Completed EV matching quiz", days: 3 },
        { type: "charging", text: "Found charging stations nearby", weeks: 1 }
      ]

      activities = sampleActivities.map(activity => {
        const timestamp = activity.hours ?
          new Date(Date.now() - activity.hours * 60 * 60 * 1000) :
          activity.days ?
            new Date(Date.now() - activity.days * 24 * 60 * 60 * 1000) :
            new Date(Date.now() - activity.weeks * 7 * 24 * 60 * 60 * 1000)

        return {
          type: activity.type,
          text: activity.text,
          time: activity.hours ? `${activity.hours} hours ago` :
            activity.days ? `${activity.days} day${activity.days > 1 ? 's' : ''} ago` :
              `${activity.weeks} week${activity.weeks > 1 ? 's' : ''} ago`,
          icon: userConfig.activity.icons[activity.type] || "fas fa-circle",
          color: userConfig.activity.colors[activity.type] || "gray",
          timestamp
        }
      })
    }

    // Filter and sort activities
    const activityLimit = parseInt(process.env.ACTIVITY_DISPLAY_LIMIT) || userConfig.activity.maxActivities
    activities = activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, activityLimit)

    // Log activity access
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'activity_feed_accessed',
        userId: user._id,
        activityCount: activities.length,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: activities,
    })
  } catch (error) {
    console.error("Get activity error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'getActivity',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Track user activity
router.post("/activity", createValidationRules('trackActivity'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: userConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    if (!userConfig.features.enableActivityTracking) {
      return res.status(404).json({
        success: false,
        message: "Activity tracking is not enabled"
      })
    }

    const { type, itemId, metadata } = req.body
    const user = await User.findById(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // External activity tracking
    const activityData = {
      userId: user._id,
      type,
      itemId,
      metadata: metadata || {},
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }

    if (process.env.ACTIVITY_TRACKING_API_URL) {
      await callExternalAPI(process.env.ACTIVITY_TRACKING_API_URL, activityData)
    }

    // Log to analytics
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'activity_tracked',
        ...activityData
      })
    }

    // Update user stats if enabled
    if (userConfig.features.enableStatsCalculation && user.stats) {
      switch (type) {
        case 'view':
          user.stats.viewedCount = (user.stats.viewedCount || 0) + 1
          break
        case 'favorite':
          user.stats.favoritesCount = (user.stats.favoritesCount || 0) + 1
          break
        case 'compare':
          user.stats.comparisonsCount = (user.stats.comparisonsCount || 0) + 1
          break
      }
      await user.save()
    }

    console.log(`User ${user._id} performed activity: ${type} on item: ${itemId}`)

    res.json({
      success: true,
      message: userConfig.messages.activityTracked,
    })
  } catch (error) {
    console.error("Track activity error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'trackActivity',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Update user preferences
router.put("/preferences", createValidationRules('updatePreferences'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: userConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const { preferences } = req.body
    const user = await User.findById(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // External preference validation
    if (userConfig.features.enablePreferenceValidation) {
      const validationResult = await callExternalAPI(process.env.PREFERENCE_VALIDATION_API_URL, {
        userId: user._id,
        preferences
      })

      if (validationResult?.invalid) {
        return res.status(400).json({
          success: false,
          message: validationResult.reason || "Invalid preferences",
          invalidFields: validationResult.invalidFields
        })
      }
    }

    // Merge preferences based on configuration
    const mergeStrategy = process.env.PREFERENCE_MERGE_STRATEGY || 'merge' // 'merge' or 'replace'

    if (mergeStrategy === 'replace') {
      user.preferences = preferences
    } else {
      user.preferences = { ...user.preferences, ...preferences }
    }

    await user.save()

    // External preference update notification
    if (process.env.PREFERENCE_UPDATE_WEBHOOK_URL) {
      await callExternalAPI(process.env.PREFERENCE_UPDATE_WEBHOOK_URL, {
        userId: user._id,
        preferences: user.preferences,
        timestamp: new Date().toISOString()
      })
    }

    // Log preference update
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'preferences_updated',
        userId: user._id,
        updatedPreferences: Object.keys(preferences),
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: userConfig.messages.preferencesUpdated,
      data: {
        preferences: user.preferences,
      },
    })
  } catch (error) {
    console.error("Update preferences error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'updatePreferences',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Delete user account
router.delete("/account", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // External account deletion validation
    if (process.env.ACCOUNT_DELETION_VALIDATION_API_URL) {
      const validationResult = await callExternalAPI(process.env.ACCOUNT_DELETION_VALIDATION_API_URL, {
        userId: user._id,
        email: user.email
      })

      if (validationResult?.blocked) {
        return res.status(403).json({
          success: false,
          message: validationResult.reason || "Account deletion not allowed"
        })
      }
    }

    // Account deletion strategy
    if (userConfig.features.enableSoftDelete) {
      // Soft delete
      user.isActive = false
      user.metadata.set('deletedAt', new Date())
      user.metadata.set('deletionReason', req.body.reason || 'user_requested')
      await user.save()
    } else {
      // Hard delete
      await User.findByIdAndDelete(req.user.userId)
    }

    // External cleanup services
    if (process.env.ACCOUNT_CLEANUP_API_URL) {
      await callExternalAPI(process.env.ACCOUNT_CLEANUP_API_URL, {
        userId: user._id,
        email: user.email,
        deletionType: userConfig.features.enableSoftDelete ? 'soft' : 'hard',
        timestamp: new Date().toISOString()
      })
    }

    // Log account deletion
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'account_deleted',
        userId: user._id,
        email: user.email,
        deletionType: userConfig.features.enableSoftDelete ? 'soft' : 'hard',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: userConfig.messages.accountDeleted,
    })
  } catch (error) {
    console.error("Delete account error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'users',
      endpoint: 'deleteAccount',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: userConfig.messages.serverError,
    })
  }
})

// Additional route: Export user data
router.get("/export", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: userConfig.messages.userNotFound,
      })
    }

    // Get comprehensive user data from external services
    const exportData = await callExternalAPI(process.env.USER_EXPORT_API_URL, {
      userId: user._id
    }, 'GET')

    const userData = {
      profile: user.toJSON(),
      exportDate: new Date().toISOString(),
      ...exportData
    }

    // Log data export
    if (userConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.USER_ANALYTICS_API_URL, {
        event: 'data_exported',
        userId: user._id,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: userData
    })
  } catch (error) {
    console.error("Export user data error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to export user data",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
    })
  }
})

module.exports = router
