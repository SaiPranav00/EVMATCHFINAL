const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const compression = require("compression")
const morgan = require("morgan")
require("dotenv").config()

// Import routes
const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const vehicleRoutes = require("./routes/vehicles")
const chargingRoutes = require("./routes/charging")
const reviewRoutes = require("./routes/reviews")
const quizRoutes = require("./routes/quiz")
const comparisonRoutes = require("./routes/comparison")

const app = express()

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
)

// CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5500", // VS Code Live Server default
      "http://127.0.0.1:5500",
      "file://"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
})

app.use("/api/", limiter)
app.use("/api/auth/login", authLimiter)
app.use("/api/auth/register", authLimiter)

// Compression middleware
app.use(compression())

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"))
} else {
  app.use(morgan("combined"))
}

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/evmatch", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB")
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  })

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EVMatch API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  })
})

// API routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/vehicles", vehicleRoutes)
app.use("/api/charging", chargingRoutes)
app.use("/api/reviews", reviewRoutes)
app.use("/api/quiz", quizRoutes)
app.use("/api/comparison", comparisonRoutes)

// 404 handler
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  })
})

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error)

  // Mongoose validation error
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }))
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    })
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0]
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    })
  }

  // JWT errors
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    })
  }

  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
    })
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  })
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received")
  console.log("Closing HTTP server...")
  server.close(() => {
    console.log("HTTP server closed")
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed")
      process.exit(0)
    })
  })
})

process.on("SIGINT", () => {
  console.log("SIGINT received")
  console.log("Closing HTTP server...")
  server.close(() => {
    console.log("HTTP server closed")
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed")
      process.exit(0)
    })
  })
})

// Start server
const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  console.log(`🚀 EVMatch API server running on port ${PORT}`)
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`🌐 API URL: http://localhost:${PORT}/api`)
})

module.exports = app
