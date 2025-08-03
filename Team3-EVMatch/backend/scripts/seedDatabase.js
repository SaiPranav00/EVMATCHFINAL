const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
require("dotenv").config()

const User = require("../models/User")
const Vehicle = require("../models/Vehicle")
const ChargingStation = require("../models/ChargingStation")
const Review = require("../models/Review")

// Configuration object - can be loaded from environment or config service
const seedConfig = {
  database: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/evmatch",
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000
  },
  seeding: {
    enableDataClear: process.env.ENABLE_DATA_CLEAR !== 'false',
    enableUserSeeding: process.env.ENABLE_USER_SEEDING !== 'false',
    enableVehicleSeeding: process.env.ENABLE_VEHICLE_SEEDING !== 'false',
    enableChargingStationSeeding: process.env.ENABLE_CHARGING_STATION_SEEDING !== 'false',
    enableReviewSeeding: process.env.ENABLE_REVIEW_SEEDING !== 'false',
    enableRatingUpdate: process.env.ENABLE_RATING_UPDATE !== 'false'
  },
  batch: {
    userBatchSize: parseInt(process.env.USER_BATCH_SIZE) || 100,
    vehicleBatchSize: parseInt(process.env.VEHICLE_BATCH_SIZE) || 50,
    stationBatchSize: parseInt(process.env.STATION_BATCH_SIZE) || 25,
    reviewBatchSize: parseInt(process.env.REVIEW_BATCH_SIZE) || 200
  },
  validation: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
    enableDataValidation: process.env.ENABLE_DATA_VALIDATION === 'true'
  },
  features: {
    enableExternalDataSource: process.env.ENABLE_EXTERNAL_DATA_SOURCE === 'true',
    enableProgressLogging: process.env.ENABLE_PROGRESS_LOGGING !== 'false',
    enableErrorLogging: process.env.ENABLE_ERROR_LOGGING === 'true',
    enableDataBackup: process.env.ENABLE_DATA_BACKUP === 'true'
  }
}

// API integration helper
const callExternalAPI = async (endpoint, data, method = 'GET') => {
  if (!endpoint) return null
  
  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_SECRET_KEY}`
      },
      body: method !== 'GET' ? JSON.stringify(data) : undefined
    })
    
    if (response.ok) {
      return await response.json()
    }
  } catch (error) {
    console.error(`External API call failed for ${endpoint}:`, error)
  }
  return null
}

// Progress logging helper
const logProgress = (message, data = {}) => {
  if (seedConfig.features.enableProgressLogging) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${message}`, data)
  }
}

// Error logging helper
const logError = async (error, context = {}) => {
  console.error("❌", error)
  
  if (seedConfig.features.enableErrorLogging) {
    await callExternalAPI(process.env.ERROR_LOGGING_API_URL, {
      service: 'database-seeding',
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    }, 'POST')
  }
}

// Get sample data from external APIs or fallback to local data
const getSampleData = async (dataType) => {
  const endpoints = {
    users: process.env.SAMPLE_USERS_API_URL,
    vehicles: process.env.SAMPLE_VEHICLES_API_URL,
    chargingStations: process.env.SAMPLE_CHARGING_STATIONS_API_URL,
    reviews: process.env.SAMPLE_REVIEWS_API_URL
  }

  if (seedConfig.features.enableExternalDataSource && endpoints[dataType]) {
    logProgress(`🌐 Fetching ${dataType} from external API...`)
    const externalData = await callExternalAPI(endpoints[dataType])
    
    if (externalData?.data) {
      logProgress(`✅ Retrieved ${externalData.data.length} ${dataType} from external source`)
      return externalData.data
    }
  }

  // Fallback to local sample data
  logProgress(`📁 Using local sample data for ${dataType}`)
  return getLocalSampleData(dataType)
}

// Local sample data as fallback
const getLocalSampleData = (dataType) => {
  const localData = {
    users: [
      {
        firstName: process.env.SAMPLE_USER_1_FIRSTNAME || "John",
        lastName: process.env.SAMPLE_USER_1_LASTNAME || "Doe",
        email: process.env.SAMPLE_USER_1_EMAIL || "john@example.com",
        password: process.env.SAMPLE_USER_1_PASSWORD || "Password123!",
        isEmailVerified: process.env.SAMPLE_USER_1_VERIFIED !== 'false',
        preferences: process.env.SAMPLE_USER_1_PREFERENCES ? 
          JSON.parse(process.env.SAMPLE_USER_1_PREFERENCES) : {
            budget: { min: 30000, max: 60000 },
            vehicleType: "sedan",
            rangeImportance: 8,
            techImportance: 7,
            chargingFeatures: ["fast-charging", "home-charging"],
            ecoFeatures: ["zero-emissions", "renewable-energy"],
          }
      },
      {
        firstName: process.env.SAMPLE_USER_2_FIRSTNAME || "Jane",
        lastName: process.env.SAMPLE_USER_2_LASTNAME || "Smith",
        email: process.env.SAMPLE_USER_2_EMAIL || "jane@example.com",
        password: process.env.SAMPLE_USER_2_PASSWORD || "Password123!",
        isEmailVerified: process.env.SAMPLE_USER_2_VERIFIED !== 'false',
        preferences: process.env.SAMPLE_USER_2_PREFERENCES ? 
          JSON.parse(process.env.SAMPLE_USER_2_PREFERENCES) : {
            budget: { min: 40000, max: 80000 },
            vehicleType: "suv",
            rangeImportance: 9,
            techImportance: 8,
            chargingFeatures: ["fast-charging", "public-network"],
            ecoFeatures: ["zero-emissions", "sustainable-materials"],
          }
      }
    ],
    vehicles: [], // Would be populated from environment or external source
    chargingStations: [], // Would be populated from environment or external source
    reviews: [] // Would be populated from environment or external source
  }

  // Load vehicles from environment if available
  if (process.env.SAMPLE_VEHICLES_JSON) {
    try {
      localData.vehicles = JSON.parse(process.env.SAMPLE_VEHICLES_JSON)
    } catch (error) {
      console.error('Failed to parse sample vehicles JSON:', error)
    }
  }

  // Load charging stations from environment if available
  if (process.env.SAMPLE_CHARGING_STATIONS_JSON) {
    try {
      localData.chargingStations = JSON.parse(process.env.SAMPLE_CHARGING_STATIONS_JSON)
    } catch (error) {
      console.error('Failed to parse sample charging stations JSON:', error)
    }
  }

  return localData[dataType] || []
}

// Validate data before insertion
const validateData = async (data, dataType) => {
  if (!seedConfig.validation.enableDataValidation) return data

  const validationResult = await callExternalAPI(process.env.DATA_VALIDATION_API_URL, {
    dataType,
    data
  }, 'POST')

  if (validationResult?.valid === false) {
    throw new Error(`Data validation failed for ${dataType}: ${validationResult.errors?.join(', ')}`)
  }

  return validationResult?.sanitizedData || data
}

// Process data in batches
const processBatch = async (data, batchSize, processor) => {
  const results = []
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    const batchResults = await processor(batch)
    results.push(...batchResults)
    
    logProgress(`📦 Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}`)
  }
  
  return results
}

// Hash passwords for users
const hashPasswords = async (users) => {
  return await Promise.all(users.map(async (user) => {
    if (user.password) {
      const salt = await bcrypt.genSalt(seedConfig.validation.saltRounds)
      user.password = await bcrypt.hash(user.password, salt)
    }
    return user
  }))
}

// Create backup before seeding
const createBackup = async () => {
  if (!seedConfig.features.enableDataBackup) return

  logProgress("💾 Creating data backup...")
  
  try {
    const backupData = {
      users: await User.find({}),
      vehicles: await Vehicle.find({}),
      chargingStations: await ChargingStation.find({}),
      reviews: await Review.find({})
    }

    if (process.env.BACKUP_API_URL) {
      await callExternalAPI(process.env.BACKUP_API_URL, {
        timestamp: new Date().toISOString(),
        data: backupData
      }, 'POST')
    }

    logProgress("✅ Backup created successfully")
  } catch (error) {
    logError(error, { context: 'backup_creation' })
  }
}

// Clear existing data
const clearExistingData = async () => {
  if (!seedConfig.seeding.enableDataClear) {
    logProgress("⏭️  Skipping data clearing (disabled)")
    return
  }

  logProgress("🗑️  Clearing existing data...")
  
  const collections = []
  if (seedConfig.seeding.enableUserSeeding) collections.push(User.deleteMany({}))
  if (seedConfig.seeding.enableVehicleSeeding) collections.push(Vehicle.deleteMany({}))
  if (seedConfig.seeding.enableChargingStationSeeding) collections.push(ChargingStation.deleteMany({}))
  if (seedConfig.seeding.enableReviewSeeding) collections.push(Review.deleteMany({}))

  await Promise.all(collections)
  logProgress("✅ Existing data cleared")
}

// Seed users
const seedUsers = async () => {
  if (!seedConfig.seeding.enableUserSeeding) {
    logProgress("⏭️  Skipping user seeding (disabled)")
    return []
  }

  logProgress("📝 Seeding users...")
  
  let sampleUsers = await getSampleData('users')
  sampleUsers = await validateData(sampleUsers, 'users')
  
  // Hash passwords in batches
  const usersWithHashedPasswords = await processBatch(
    sampleUsers, 
    seedConfig.batch.userBatchSize,
    hashPasswords
  )

  const users = await User.insertMany(usersWithHashedPasswords)
  logProgress(`✅ Inserted ${users.length} users`)

  // Log user creation to external service
  if (process.env.USER_CREATION_LOG_API_URL) {
    await callExternalAPI(process.env.USER_CREATION_LOG_API_URL, {
      event: 'bulk_users_created',
      count: users.length,
      timestamp: new Date().toISOString()
    }, 'POST')
  }

  return users
}

// Seed vehicles
const seedVehicles = async () => {
  if (!seedConfig.seeding.enableVehicleSeeding) {
    logProgress("⏭️  Skipping vehicle seeding (disabled)")
    return []
  }

  logProgress("🚗 Seeding vehicles...")
  
  let sampleVehicles = await getSampleData('vehicles')
  sampleVehicles = await validateData(sampleVehicles, 'vehicles')

  const vehicles = await processBatch(
    sampleVehicles,
    seedConfig.batch.vehicleBatchSize,
    async (batch) => await Vehicle.insertMany(batch)
  )

  const flatVehicles = vehicles.flat()
  logProgress(`✅ Inserted ${flatVehicles.length} vehicles`)

  // Sync vehicles with external pricing API
  if (process.env.VEHICLE_PRICING_SYNC_API_URL) {
    await callExternalAPI(process.env.VEHICLE_PRICING_SYNC_API_URL, {
      vehicleIds: flatVehicles.map(v => v._id),
      action: 'initial_sync'
    }, 'POST')
  }

  return flatVehicles
}

// Seed charging stations
const seedChargingStations = async () => {
  if (!seedConfig.seeding.enableChargingStationSeeding) {
    logProgress("⏭️  Skipping charging station seeding (disabled)")
    return []
  }

  logProgress("🔌 Seeding charging stations...")
  
  let sampleStations = await getSampleData('chargingStations')
  sampleStations = await validateData(sampleStations, 'chargingStations')

  const stations = await processBatch(
    sampleStations,
    seedConfig.batch.stationBatchSize,
    async (batch) => await ChargingStation.insertMany(batch)
  )

  const flatStations = stations.flat()
  logProgress(`✅ Inserted ${flatStations.length} charging stations`)

  // Register stations with external network APIs
  if (process.env.CHARGING_NETWORK_REGISTRATION_API_URL) {
    await callExternalAPI(process.env.CHARGING_NETWORK_REGISTRATION_API_URL, {
      stations: flatStations.map(s => ({
        id: s._id,
        network: s.network,
        location: s.location
      }))
    }, 'POST')
  }

  return flatStations
}

// Generate dynamic reviews
const generateReviews = async (users, vehicles) => {
  let sampleReviews = await getSampleData('reviews')
  
  if (sampleReviews.length === 0) {
    // Generate reviews dynamically if no external data
    const reviewCount = parseInt(process.env.GENERATED_REVIEW_COUNT) || Math.min(users.length * 2, 50)
    
    for (let i = 0; i < reviewCount; i++) {
      const user = users[Math.floor(Math.random() * users.length)]
      const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)]
      
      const reviewTemplate = process.env.REVIEW_TEMPLATES ? 
        JSON.parse(process.env.REVIEW_TEMPLATES) : [
          {
            ratings: { overall: 5, range: 5, charging: 5, technology: 5, comfort: 4, value: 4 },
            title: "Amazing EV Experience",
            content: "Excellent vehicle with great performance and features.",
            pros: ["Excellent range", "Fast charging", "Advanced technology"],
            cons: ["Premium price"],
            ownership: { duration_months: 12, mileage: 15000, usage_type: "daily_commute" }
          }
        ]
      
      const template = reviewTemplate[Math.floor(Math.random() * reviewTemplate.length)]
      
      sampleReviews.push({
        user: user._id,
        vehicle: vehicle._id,
        ...template,
        verified: Math.random() > 0.3
      })
    }
  } else {
    // Map user and vehicle IDs to actual documents
    sampleReviews = sampleReviews.map(review => ({
      ...review,
      user: users[Math.floor(Math.random() * users.length)]._id,
      vehicle: vehicles[Math.floor(Math.random() * vehicles.length)]._id
    }))
  }
  
  return sampleReviews
}

// Seed reviews
const seedReviews = async (users, vehicles) => {
  if (!seedConfig.seeding.enableReviewSeeding || !users.length || !vehicles.length) {
    logProgress("⏭️  Skipping review seeding (disabled or no data)")
    return []
  }

  logProgress("⭐ Seeding reviews...")
  
  let sampleReviews = await generateReviews(users, vehicles)
  sampleReviews = await validateData(sampleReviews, 'reviews')

  const reviews = await processBatch(
    sampleReviews,
    seedConfig.batch.reviewBatchSize,
    async (batch) => await Review.insertMany(batch)
  )

  const flatReviews = reviews.flat()
  logProgress(`✅ Inserted ${flatReviews.length} reviews`)

  // Send reviews to sentiment analysis API
  if (process.env.SENTIMENT_ANALYSIS_API_URL) {
    await callExternalAPI(process.env.SENTIMENT_ANALYSIS_API_URL, {
      reviews: flatReviews.map(r => ({
        id: r._id,
        content: r.content,
        title: r.title
      }))
    }, 'POST')
  }

  return flatReviews
}

// Update vehicle ratings
const updateVehicleRatings = async (vehicles) => {
  if (!seedConfig.seeding.enableRatingUpdate || !vehicles.length) {
    logProgress("⏭️  Skipping rating updates (disabled or no vehicles)")
    return
  }

  logProgress("🔄 Updating vehicle ratings...")
  
  const updatePromises = vehicles.map(vehicle => 
    Review.calculateVehicleRatings(vehicle._id)
  )
  
  await Promise.all(updatePromises)
  logProgress("✅ Updated vehicle ratings")

  // Sync ratings with external services
  if (process.env.RATING_SYNC_API_URL) {
    await callExternalAPI(process.env.RATING_SYNC_API_URL, {
      vehicleIds: vehicles.map(v => v._id),
      action: 'ratings_updated',
      timestamp: new Date().toISOString()
    }, 'POST')
  }
}

// Generate seeding summary
const generateSummary = async (results) => {
  const summary = {
    timestamp: new Date().toISOString(),
    results: {
      users: results.users?.length || 0,
      vehicles: results.vehicles?.length || 0,
      chargingStations: results.chargingStations?.length || 0,
      reviews: results.reviews?.length || 0
    },
    configuration: {
      externalDataSource: seedConfig.features.enableExternalDataSource,
      batchProcessing: true,
      dataValidation: seedConfig.validation.enableDataValidation
    }
  }

  // Send summary to monitoring API
  if (process.env.SEEDING_MONITORING_API_URL) {
    await callExternalAPI(process.env.SEEDING_MONITORING_API_URL, summary, 'POST')
  }

  return summary
}

// Main seeding function
const seedDatabase = async () => {
  const startTime = Date.now()
  
  try {
    logProgress("🌱 Starting database seeding...")

    // Connect to MongoDB
    await mongoose.connect(seedConfig.database.uri, {
      serverSelectionTimeoutMS: seedConfig.database.connectionTimeout
    })
    logProgress("✅ Connected to MongoDB")

    // Create backup if enabled
    await createBackup()

    // Clear existing data
    await clearExistingData()

    // Seed data in order
    const users = await seedUsers()
    const vehicles = await seedVehicles()
    const chargingStations = await seedChargingStations()
    const reviews = await seedReviews(users, vehicles)

    // Update vehicle ratings
    await updateVehicleRatings(vehicles)

    // Generate and log summary
    const results = { users, vehicles, chargingStations, reviews }
    const summary = await generateSummary(results)

    const duration = (Date.now() - startTime) / 1000
    
    logProgress("🎉 Database seeding completed successfully!")
    logProgress(`⏱️  Total time: ${duration}s`)
    logProgress("\n📊 Summary:")
    logProgress(`   Users: ${summary.results.users}`)
    logProgress(`   Vehicles: ${summary.results.vehicles}`)
    logProgress(`   Charging Stations: ${summary.results.chargingStations}`)
    logProgress(`   Reviews: ${summary.results.reviews}`)

    // Success notification
    if (process.env.SUCCESS_NOTIFICATION_API_URL) {
      await callExternalAPI(process.env.SUCCESS_NOTIFICATION_API_URL, {
        event: 'seeding_completed',
        summary,
        duration
      }, 'POST')
    }

    process.exit(0)
  } catch (error) {
    await logError(error, { context: 'database_seeding' })
    
    // Failure notification
    if (process.env.FAILURE_NOTIFICATION_API_URL) {
      await callExternalAPI(process.env.FAILURE_NOTIFICATION_API_URL, {
        event: 'seeding_failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'POST')
    }
    
    process.exit(1)
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
  }
}

// Health check function
const healthCheck = async () => {
  try {
    await mongoose.connect(seedConfig.database.uri)
    const collections = await mongoose.connection.db.listCollections().toArray()
    
    const health = {
      status: 'healthy',
      collections: collections.map(c => c.name),
      timestamp: new Date().toISOString()
    }
    
    console.log('✅ Health check passed:', health)
    return health
  } catch (error) {
    console.error('❌ Health check failed:', error)
    throw error
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
  }
}

// CLI interface
const main = async () => {
  const command = process.argv[2]
  
  switch (command) {
    case 'health':
      await healthCheck()
      break
    case 'seed':
    default:
      await seedDatabase()
      break
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

module.exports = { seedDatabase, healthCheck }
