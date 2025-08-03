const express = require("express")
const { query, param, body, validationResult } = require("express-validator")
const ChargingStation = require("../models/ChargingStation")
const { auth } = require("../middleware/auth")

const router = express.Router()

// Get charging stations with location-based search
router.get(
  "/",
  [
    query("lat").optional().isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
    query("lng").optional().isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
    query("radius").optional().isInt({ min: 1, max: 100 }).withMessage("Radius must be between 1 and 100 km"),
    query("network").optional().isIn(["Tesla", "ChargePoint", "Electrify America", "EVgo", "Blink", "Other"]),
    query("connectorType").optional().isIn(["CCS", "CHAdeMO", "Tesla", "Type2", "J1772"]),
    query("minPower").optional().isInt({ min: 1 }).withMessage("Min power must be positive"),
    query("amenities").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { lat, lng, radius = 25, network, connectorType, minPower, amenities } = req.query

      const query = { isActive: true }

      // Location-based search
      if (lat && lng) {
        const radiusInMeters = Number.parseInt(radius) * 1000
        query["location.coordinates"] = {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [Number.parseFloat(lng), Number.parseFloat(lat)],
            },
            $maxDistance: radiusInMeters,
          },
        }
      }

      // Network filter
      if (network) {
        query.network = network
      }

      // Connector type filter
      if (connectorType) {
        query["connectors.type"] = connectorType
      }

      // Minimum power filter
      if (minPower) {
        query["connectors.power_kw"] = { $gte: Number.parseInt(minPower) }
      }

      // Amenities filter
      if (amenities) {
        const amenityList = amenities.split(",")
        query.amenities = { $in: amenityList }
      }

      const stations = await ChargingStation.find(query).limit(50).select("-metadata -__v")

      res.json({
        success: true,
        data: {
          stations,
          count: stations.length,
        },
      })
    } catch (error) {
      console.error("Get charging stations error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to fetch charging stations",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      })
    }
  },
)

// Get charging station by ID
router.get("/:id", [param("id").isMongoId().withMessage("Invalid station ID")], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const station = await ChargingStation.findById(req.params.id)

    if (!station || !station.isActive) {
      return res.status(404).json({
        success: false,
        message: "Charging station not found",
      })
    }

    // Increment view count
    station.metadata.views += 1
    await station.save()

    res.json({
      success: true,
      data: { station },
    })
  } catch (error) {
    console.error("Get charging station error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch charging station",
      error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
    })
  }
})

// Update connector availability (for station operators)
router.patch(
  "/:id/connectors/:connectorType/availability",
  [
    param("id").isMongoId().withMessage("Invalid station ID"),
    param("connectorType").isIn(["CCS", "CHAdeMO", "Tesla", "Type2", "J1772"]),
    body("available").isInt({ min: 0 }).withMessage("Available count must be non-negative"),
  ],
  auth,
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { id, connectorType } = req.params
      const { available } = req.body

      const station = await ChargingStation.findById(id)
      if (!station) {
        return res.status(404).json({
          success: false,
          message: "Charging station not found",
        })
      }

      await station.updateConnectorAvailability(connectorType, available)

      res.json({
        success: true,
        message: "Connector availability updated",
        data: { station },
      })
    } catch (error) {
      console.error("Update connector availability error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update connector availability",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      })
    }
  },
)

module.exports = router
