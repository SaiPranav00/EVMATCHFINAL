const express = require("express")
const { body, validationResult } = require("express-validator")
const axios = require("axios")
const _ = require("lodash")
const Vehicle = require("../models/Vehicle")
const { auth } = require("../middleware/auth")

const router = express.Router()

router.post(
  "/",
  [
    body("vehicleIds")
      .isArray({ min: 2, max: 3 })
      .withMessage("Must compare 2-3 vehicles"),
    body("vehicleIds.*").isMongoId().withMessage("Invalid vehicle ID"),
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

      const { vehicleIds } = req.body

      // Fetch vehicles from DB
      const vehicles = await Vehicle.find({
        _id: { $in: vehicleIds },
        isActive: true,
      })

      if (vehicles.length !== vehicleIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more vehicles not found",
        })
      }

      // Update comparison count
      await Vehicle.updateMany(
        { _id: { $in: vehicleIds } },
        { $inc: { "metadata.comparisons": 1 } }
      )

      // Fetch comparison config dynamically from your API or DB
      const configResponse = await axios.get(
        "https://example.com/api/comparison-config" // Replace with your actual API
      )
      const comparisonConfig = configResponse.data

      // Generate comparison dynamically
      const comparison = generateDynamicComparison(vehicles, comparisonConfig)

      res.json({
        success: true,
        data: { comparison },
      })
    } catch (error) {
      console.error("Vehicle comparison error:", error)
      res.status(500).json({
        success: false,
        message: "Failed to compare vehicles",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      })
    }
  }
)

// Dynamic comparison generator
function generateDynamicComparison(vehicles, config) {
  const comparison = {
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle._id,
      name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      data: vehicle,
    })),
    categories: [],
  }

  config.forEach((category) => {
    const specs = category.specs.map((spec) => {
      // If you want to support custom calculations (like Effective Price), you can enhance here.
      // For now, assume spec.key is direct path into vehicle object.

      const values = vehicles.map((v) => {
        const rawValue = _.get(v, spec.key)

        // Support for dynamic calculation if specified: e.g., "price.msrp - price.incentives.federal - price.incentives.state - price.incentives.local"
        // You can add code here to parse and evaluate those expressions if needed.

        return {
          value: rawValue !== undefined ? rawValue : null,
          formatted: formatValue(rawValue, spec.type),
          winner: false,
        }
      })

      // Compute winner based on compare rule
      if (spec.compare === "min") {
        const minValue = Math.min(
          ...values.map((v) => (v.value !== null ? v.value : Number.POSITIVE_INFINITY))
        )
        values.forEach((v) => (v.winner = v.value === minValue))
      } else if (spec.compare === "max") {
        const maxValue = Math.max(
          ...values.map((v) => (v.value !== null ? v.value : Number.NEGATIVE_INFINITY))
        )
        values.forEach((v) => (v.winner = v.value === maxValue))
      }
      // If no compare field or different value, do not mark winners

      return {
        name: spec.label,
        values,
      }
    })

    comparison.categories.push({
      name: category.name,
      specs,
    })
  })

  return comparison
}

// Helper to format values according to type
function formatValue(value, type) {
  if (value === null || value === undefined) return "N/A"

  switch (type) {
    case "currency":
      return `$${value.toLocaleString()}`
    case "number":
      return value.toString()
    case "string":
      return value
    case "minutes":
      return `${value} min`
    case "mph":
      return `${value} mph`
    case "hp":
      return `${value} hp`
    case "mpge":
      return `${value} MPGe`
    case "feet3":
      return `${value} ft³`
    case "seats":
      return `${value} seats`
    default:
      return value.toString()
  }
}

module.exports = router
