const express = require("express")
const { body, param, query, validationResult } = require("express-validator")
const Review = require("../models/Review")
const Vehicle = require("../models/Vehicle")
const { auth } = require("../middleware/auth")

const router = express.Router()

// Configuration object - can be loaded from environment or config service
const reviewConfig = {
  validation: {
    ratings: {
      min: parseInt(process.env.RATING_MIN) || 1,
      max: parseInt(process.env.RATING_MAX) || 5,
      categories: process.env.REVIEW_RATING_CATEGORIES?.split(',') ||
        ['overall', 'range', 'charging', 'technology', 'comfort', 'value']
    },
    title: {
      minLength: parseInt(process.env.TITLE_MIN_LENGTH) || 5,
      maxLength: parseInt(process.env.TITLE_MAX_LENGTH) || 100
    },
    content: {
      minLength: parseInt(process.env.CONTENT_MIN_LENGTH) || 50,
      maxLength: parseInt(process.env.CONTENT_MAX_LENGTH) || 2000
    },
    pagination: {
      minPage: parseInt(process.env.MIN_PAGE) || 1,
      minLimit: parseInt(process.env.MIN_LIMIT) || 1,
      maxLimit: parseInt(process.env.MAX_LIMIT) || 50,
      defaultLimit: parseInt(process.env.DEFAULT_LIMIT) || 10
    },
    arrays: {
      maxPros: parseInt(process.env.MAX_PROS) || 10,
      maxCons: parseInt(process.env.MAX_CONS) || 10
    }
  },
  enums: {
    sortFields: process.env.SORT_FIELDS?.split(',') ||
      ["createdAt", "helpful_votes", "ratings.overall"],
    sortOrders: process.env.SORT_ORDERS?.split(',') || ["asc", "desc"],
    usageTypes: process.env.USAGE_TYPES?.split(',') ||
      ["daily_commute", "weekend_trips", "long_distance", "city_driving", "mixed"]
  },
  defaults: {
    sortBy: process.env.DEFAULT_SORT_BY || "createdAt",
    sortOrder: process.env.DEFAULT_SORT_ORDER || "desc",
    page: parseInt(process.env.DEFAULT_PAGE) || 1
  },
  features: {
    enableDuplicateCheck: process.env.ENABLE_DUPLICATE_REVIEW_CHECK !== 'false',
    enableSoftDelete: process.env.ENABLE_SOFT_DELETE !== 'false',
    enableHelpfulVoting: process.env.ENABLE_HELPFUL_VOTING !== 'false',
    enableModeration: process.env.ENABLE_REVIEW_MODERATION === 'true',
    enableAnalytics: process.env.ENABLE_REVIEW_ANALYTICS === 'true',
    enableExternalValidation: process.env.ENABLE_EXTERNAL_REVIEW_VALIDATION === 'true',
    enableNotifications: process.env.ENABLE_REVIEW_NOTIFICATIONS === 'true'
  },
  permissions: {
    adminRole: process.env.ADMIN_ROLE || "admin",
    enableOwnershipCheck: process.env.ENABLE_OWNERSHIP_CHECK !== 'false',
    enablePermissionAPI: process.env.ENABLE_PERMISSION_API === 'true'
  },
  messages: {
    validationFailed: process.env.VALIDATION_FAILED_MESSAGE || "Validation failed",
    vehicleNotFound: process.env.VEHICLE_NOT_FOUND_MESSAGE || "Vehicle not found",
    reviewNotFound: process.env.REVIEW_NOT_FOUND_MESSAGE || "Review not found",
    alreadyReviewed: process.env.ALREADY_REVIEWED_MESSAGE || "You have already reviewed this vehicle",
    notAuthorized: process.env.NOT_AUTHORIZED_MESSAGE || "Not authorized to perform this action",
    reviewCreated: process.env.REVIEW_CREATED_MESSAGE || "Review created successfully",
    reviewUpdated: process.env.REVIEW_UPDATED_MESSAGE || "Review updated successfully",
    reviewDeleted: process.env.REVIEW_DELETED_MESSAGE || "Review deleted successfully",
    voteRecorded: process.env.VOTE_RECORDED_MESSAGE || "Vote recorded"
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
    case 'getReviews':
      rules.push(
        param("vehicleId").isMongoId().withMessage("Invalid vehicle ID"),
        query("page").optional()
          .isInt({ min: reviewConfig.validation.pagination.minPage })
          .withMessage(`Page must be at least ${reviewConfig.validation.pagination.minPage}`),
        query("limit").optional()
          .isInt({
            min: reviewConfig.validation.pagination.minLimit,
            max: reviewConfig.validation.pagination.maxLimit
          })
          .withMessage(`Limit must be ${reviewConfig.validation.pagination.minLimit}-${reviewConfig.validation.pagination.maxLimit}`),
        query("sortBy").optional().isIn(reviewConfig.enums.sortFields)
          .withMessage(`Sort field must be one of: ${reviewConfig.enums.sortFields.join(', ')}`),
        query("sortOrder").optional().isIn(reviewConfig.enums.sortOrders)
          .withMessage(`Sort order must be one of: ${reviewConfig.enums.sortOrders.join(', ')}`)
      )
      break

    case 'createReview':
      rules.push(
        body("vehicle").isMongoId().withMessage("Valid vehicle ID is required"),
        body("title").trim()
          .isLength({
            min: reviewConfig.validation.title.minLength,
            max: reviewConfig.validation.title.maxLength
          })
          .withMessage(`Title must be ${reviewConfig.validation.title.minLength}-${reviewConfig.validation.title.maxLength} characters`),
        body("content").trim()
          .isLength({
            min: reviewConfig.validation.content.minLength,
            max: reviewConfig.validation.content.maxLength
          })
          .withMessage(`Content must be ${reviewConfig.validation.content.minLength}-${reviewConfig.validation.content.maxLength} characters`),
        body("pros").optional()
          .isArray({ max: reviewConfig.validation.arrays.maxPros })
          .withMessage(`Maximum ${reviewConfig.validation.arrays.maxPros} pros allowed`),
        body("cons").optional()
          .isArray({ max: reviewConfig.validation.arrays.maxCons })
          .withMessage(`Maximum ${reviewConfig.validation.arrays.maxCons} cons allowed`),
        body("ownership.duration_months").optional()
          .isInt({ min: 0 }).withMessage("Duration must be non-negative"),
        body("ownership.mileage").optional()
          .isInt({ min: 0 }).withMessage("Mileage must be non-negative"),
        body("ownership.usage_type").optional()
          .isIn(reviewConfig.enums.usageTypes)
          .withMessage(`Usage type must be one of: ${reviewConfig.enums.usageTypes.join(', ')}`)
      )

      // Dynamic rating validations
      reviewConfig.validation.ratings.categories.forEach(category => {
        const isRequired = category === 'overall'
        rules.push(
          body(`ratings.${category}`)
          [isRequired ? 'exists' : 'optional']()
            .isInt({
              min: reviewConfig.validation.ratings.min,
              max: reviewConfig.validation.ratings.max
            })
            .withMessage(`${category} rating must be ${reviewConfig.validation.ratings.min}-${reviewConfig.validation.ratings.max}`)
        )
      })
      break

    case 'updateReview':
      rules.push(
        param("id").isMongoId().withMessage("Invalid review ID"),
        body("ratings.overall")
          .isInt({
            min: reviewConfig.validation.ratings.min,
            max: reviewConfig.validation.ratings.max
          })
          .withMessage(`Overall rating must be ${reviewConfig.validation.ratings.min}-${reviewConfig.validation.ratings.max}`),
        body("title").trim()
          .isLength({
            min: reviewConfig.validation.title.minLength,
            max: reviewConfig.validation.title.maxLength
          })
          .withMessage(`Title must be ${reviewConfig.validation.title.minLength}-${reviewConfig.validation.title.maxLength} characters`),
        body("content").trim()
          .isLength({
            min: reviewConfig.validation.content.minLength,
            max: reviewConfig.validation.content.maxLength
          })
          .withMessage(`Content must be ${reviewConfig.validation.content.minLength}-${reviewConfig.validation.content.maxLength} characters`)
      )
      break

    case 'deleteReview':
    case 'helpfulVote':
      rules.push(
        param("id").isMongoId().withMessage("Invalid review ID")
      )
      break
  }

  return rules
}

// Permission check helper
const checkPermissions = async (action, userId, reviewId = null, userRole = null) => {
  if (!reviewConfig.permissions.enablePermissionAPI) {
    return { allowed: true }
  }

  const permissionResult = await callExternalAPI(process.env.REVIEW_PERMISSION_API_URL, {
    action,
    userId,
    reviewId,
    userRole
  })

  return permissionResult || { allowed: false, reason: 'Permission check failed' }
}

// Get reviews for a vehicle
router.get("/vehicle/:vehicleId", createValidationRules('getReviews'), async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: reviewConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const { vehicleId } = req.params
    const {
      page = reviewConfig.defaults.page,
      limit = reviewConfig.validation.pagination.defaultLimit,
      sortBy = reviewConfig.defaults.sortBy,
      sortOrder = reviewConfig.defaults.sortOrder
    } = req.query

    // Check if vehicle exists
    const vehicle = await Vehicle.findById(vehicleId)
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: reviewConfig.messages.vehicleNotFound,
      })
    }

    // Build dynamic query
    const query = { vehicle: vehicleId, isActive: true }

    // Additional filters from environment
    const additionalFilters = process.env.REVIEW_ADDITIONAL_FILTERS
    if (additionalFilters) {
      try {
        const filters = JSON.parse(additionalFilters)
        Object.assign(query, filters)
      } catch (error) {
        console.error('Failed to parse additional filters:', error)
      }
    }

    // Build sort object dynamically
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    // Dynamic populate fields
    const populateFields = process.env.REVIEW_POPULATE_FIELDS || "firstName lastName avatar"

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("user", populateFields)
        .sort(sort)
        .skip(skip)
        .limit(Number.parseInt(limit)),
      Review.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / Number.parseInt(limit))

    // Log analytics
    if (reviewConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
        event: 'reviews_fetched',
        vehicleId,
        resultCount: reviews.length,
        filters: { page, limit, sortBy, sortOrder },
        timestamp: new Date().toISOString()
      })
    }

    // Build response dynamically
    const responseFields = process.env.REVIEW_RESPONSE_FIELDS?.split(',') ||
      ['reviews', 'pagination']

    const responseData = {}

    if (responseFields.includes('reviews')) {
      responseData.reviews = reviews
    }
    if (responseFields.includes('pagination')) {
      responseData.pagination = {
        currentPage: Number.parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: Number.parseInt(limit),
      }
    }
    if (responseFields.includes('vehicle')) {
      responseData.vehicle = {
        id: vehicle._id,
        name: vehicle.fullName,
        ratings: vehicle.ratings
      }
    }
    if (responseFields.includes('summary')) {
      responseData.summary = {
        averageRating: reviews.reduce((sum, r) => sum + r.ratings.overall, 0) / reviews.length || 0,
        totalReviews: total
      }
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("Get reviews error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'reviews',
      endpoint: 'getReviews',
      vehicleId: req.params.vehicleId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Create a review
router.post("/", createValidationRules('createReview'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: reviewConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const { vehicle, ratings, title, content, pros, cons, ownership } = req.body

    // Check permissions
    const permissionCheck = await checkPermissions('create', req.user.userId)
    if (!permissionCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: permissionCheck.reason || reviewConfig.messages.notAuthorized
      })
    }

    // Check if vehicle exists
    const vehicleDoc = await Vehicle.findById(vehicle)
    if (!vehicleDoc) {
      return res.status(404).json({
        success: false,
        message: reviewConfig.messages.vehicleNotFound,
      })
    }

    // Check for duplicate review
    if (reviewConfig.features.enableDuplicateCheck) {
      const existingReview = await Review.findOne({
        user: req.user.userId,
        vehicle: vehicle,
      })

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: reviewConfig.messages.alreadyReviewed,
        })
      }
    }

    // External validation
    if (reviewConfig.features.enableExternalValidation) {
      const validationResult = await callExternalAPI(process.env.REVIEW_VALIDATION_API_URL, {
        userId: req.user.userId,
        vehicleId: vehicle,
        content,
        ratings
      })

      if (validationResult?.blocked) {
        return res.status(403).json({
          success: false,
          message: validationResult.reason || "Review blocked by validation service"
        })
      }
    }

    // Create review with dynamic data structure
    const reviewData = {
      user: req.user.userId,
      vehicle,
      ratings,
      title,
      content,
      pros: pros || [],
      cons: cons || [],
      ownership: ownership || {}
    }

    // Add additional fields from environment
    const additionalFields = process.env.REVIEW_ADDITIONAL_FIELDS?.split(',') || []
    additionalFields.forEach(field => {
      if (req.body[field] !== undefined) {
        reviewData[field] = req.body[field]
      }
    })

    const review = new Review(reviewData)
    await review.save()

    // Populate user data for response
    const populateFields = process.env.REVIEW_POPULATE_FIELDS || "firstName lastName avatar"
    await review.populate("user", populateFields)

    // Moderation check
    if (reviewConfig.features.enableModeration) {
      const moderationResult = await callExternalAPI(process.env.MODERATION_API_URL, {
        reviewId: review._id,
        content,
        title,
        userId: req.user.userId
      })

      if (moderationResult?.flagged) {
        review.reported = true
        review.metadata.set('moderationFlags', moderationResult.flags)
        await review.save()
      }
    }

    // Send notifications
    if (reviewConfig.features.enableNotifications) {
      await callExternalAPI(process.env.NOTIFICATION_API_URL, {
        type: 'new_review',
        reviewId: review._id,
        vehicleId: vehicle,
        userId: req.user.userId,
        vehicleName: vehicleDoc.fullName
      })
    }

    // Log analytics
    if (reviewConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
        event: 'review_created',
        reviewId: review._id,
        vehicleId: vehicle,
        userId: req.user.userId,
        ratings,
        timestamp: new Date().toISOString()
      })
    }

    res.status(201).json({
      success: true,
      message: reviewConfig.messages.reviewCreated,
      data: { review },
    })
  } catch (error) {
    console.error("Create review error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'reviews',
      endpoint: 'createReview',
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Update a review
router.put("/:id", createValidationRules('updateReview'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: reviewConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const review = await Review.findById(req.params.id)

    if (!review) {
      return res.status(404).json({
        success: false,
        message: reviewConfig.messages.reviewNotFound,
      })
    }

    // Check ownership and permissions
    if (reviewConfig.permissions.enableOwnershipCheck) {
      const permissionCheck = await checkPermissions('update', req.user.userId, req.params.id, req.user.role)

      if (!permissionCheck.allowed && review.user.toString() !== req.user.userId) {
        return res.status(403).json({
          success: false,
          message: reviewConfig.messages.notAuthorized,
        })
      }
    }

    // Update review with dynamic fields
    const { ratings, title, content, pros, cons, ownership } = req.body
    const updateFields = process.env.REVIEW_UPDATE_FIELDS?.split(',') ||
      ['ratings', 'title', 'content', 'pros', 'cons', 'ownership']

    if (updateFields.includes('ratings')) review.ratings = ratings
    if (updateFields.includes('title')) review.title = title
    if (updateFields.includes('content')) review.content = content
    if (updateFields.includes('pros') && pros) review.pros = pros
    if (updateFields.includes('cons') && cons) review.cons = cons
    if (updateFields.includes('ownership') && ownership) {
      review.ownership = { ...review.ownership, ...ownership }
    }

    // Additional dynamic updates
    updateFields.forEach(field => {
      if (req.body[field] && !['ratings', 'title', 'content', 'pros', 'cons', 'ownership'].includes(field)) {
        review[field] = req.body[field]
      }
    })

    await review.save()

    const populateFields = process.env.REVIEW_POPULATE_FIELDS || "firstName lastName avatar"
    await review.populate("user", populateFields)

    // Log analytics
    if (reviewConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
        event: 'review_updated',
        reviewId: review._id,
        userId: req.user.userId,
        changes: updateFields,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: reviewConfig.messages.reviewUpdated,
      data: { review },
    })
  } catch (error) {
    console.error("Update review error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'reviews',
      endpoint: 'updateReview',
      reviewId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to update review",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Delete a review
router.delete("/:id", createValidationRules('deleteReview'), auth, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: reviewConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const review = await Review.findById(req.params.id)

    if (!review) {
      return res.status(404).json({
        success: false,
        message: reviewConfig.messages.reviewNotFound,
      })
    }

    // Check permissions
    const isOwner = review.user.toString() === req.user.userId
    const isAdmin = req.user.role === reviewConfig.permissions.adminRole

    if (reviewConfig.permissions.enableOwnershipCheck && !isOwner && !isAdmin) {
      const permissionCheck = await checkPermissions('delete', req.user.userId, req.params.id, req.user.role)

      if (!permissionCheck.allowed) {
        return res.status(403).json({
          success: false,
          message: reviewConfig.messages.notAuthorized,
        })
      }
    }

    // Soft or hard delete based on configuration
    if (reviewConfig.features.enableSoftDelete) {
      review.isActive = false
      review.metadata.set('deletedAt', new Date())
      review.metadata.set('deletedBy', req.user.userId)
      await review.save()
    } else {
      await Review.findByIdAndDelete(req.params.id)
    }

    // Log analytics
    if (reviewConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
        event: 'review_deleted',
        reviewId: review._id,
        deletedBy: req.user.userId,
        deletionType: reviewConfig.features.enableSoftDelete ? 'soft' : 'hard',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      message: reviewConfig.messages.reviewDeleted,
    })
  } catch (error) {
    console.error("Delete review error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'reviews',
      endpoint: 'deleteReview',
      reviewId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Vote helpful on a review
router.post("/:id/helpful", createValidationRules('helpfulVote'), auth, async (req, res) => {
  try {
    if (!reviewConfig.features.enableHelpfulVoting) {
      return res.status(404).json({
        success: false,
        message: "Helpful voting is not enabled"
      })
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: reviewConfig.messages.validationFailed,
        errors: errors.array(),
      })
    }

    const review = await Review.findById(req.params.id)

    if (!review || !review.isActive) {
      return res.status(404).json({
        success: false,
        message: reviewConfig.messages.reviewNotFound,
      })
    }

    // Check for duplicate votes (if tracking enabled)
    if (process.env.ENABLE_VOTE_TRACKING === 'true') {
      const existingVote = await callExternalAPI(process.env.VOTE_TRACKING_API_URL, {
        userId: req.user.userId,
        reviewId: req.params.id,
        action: 'check_vote'
      }, 'GET')

      if (existingVote?.hasVoted) {
        return res.status(400).json({
          success: false,
          message: "You have already voted on this review"
        })
      }
    }

    // Increment helpful votes
    const voteIncrement = parseInt(process.env.VOTE_INCREMENT) || 1
    review.helpful_votes += voteIncrement
    await review.save()

    // Track vote
    if (process.env.ENABLE_VOTE_TRACKING === 'true') {
      await callExternalAPI(process.env.VOTE_TRACKING_API_URL, {
        userId: req.user.userId,
        reviewId: req.params.id,
        action: 'record_vote',
        timestamp: new Date().toISOString()
      })
    }

    // Update user reputation
    if (process.env.USER_REPUTATION_API_URL) {
      await callExternalAPI(process.env.USER_REPUTATION_API_URL, {
        userId: review.user,
        action: 'helpful_vote_received',
        points: parseInt(process.env.HELPFUL_VOTE_POINTS) || 1
      })
    }

    // Log analytics
    if (reviewConfig.features.enableAnalytics) {
      await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
        event: 'helpful_vote',
        reviewId: req.params.id,
        votedBy: req.user.userId,
        newVoteCount: review.helpful_votes,
        timestamp: new Date().toISOString()
      })
    }

    // Build response
    const responseFields = process.env.VOTE_RESPONSE_FIELDS?.split(',') || ['helpful_votes']
    const responseData = {}

    if (responseFields.includes('helpful_votes')) {
      responseData.helpful_votes = review.helpful_votes
    }
    if (responseFields.includes('voteIncrement')) {
      responseData.voteIncrement = voteIncrement
    }
    if (responseFields.includes('timestamp')) {
      responseData.timestamp = new Date().toISOString()
    }

    res.json({
      success: true,
      message: reviewConfig.messages.voteRecorded,
      data: responseData,
    })
  } catch (error) {
    console.error("Vote helpful error:", error)

    // Log error
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'reviews',
      endpoint: 'helpfulVote',
      reviewId: req.params.id,
      userId: req.user?.userId,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({
      success: false,
      message: "Failed to record vote",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Additional route: Report review
router.post("/:id/report",
  [
    param("id").isMongoId().withMessage("Invalid review ID"),
    body("reason").notEmpty().withMessage("Report reason is required"),
    body("details").optional().isString()
  ],
  auth,
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: reviewConfig.messages.validationFailed,
          errors: errors.array(),
        })
      }

      const { reason, details } = req.body
      const review = await Review.findById(req.params.id)

      if (!review || !review.isActive) {
        return res.status(404).json({
          success: false,
          message: reviewConfig.messages.reviewNotFound,
        })
      }

      // Use the review's reportReview method
      await review.reportReview(reason, details)

      // Log report
      if (reviewConfig.features.enableAnalytics) {
        await callExternalAPI(process.env.REVIEW_ANALYTICS_API_URL, {
          event: 'review_reported',
          reviewId: req.params.id,
          reportedBy: req.user.userId,
          reason,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        message: "Review reported successfully"
      })
    } catch (error) {
      console.error("Report review error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to report review",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error"
      })
    }
  }
)

module.exports = router
