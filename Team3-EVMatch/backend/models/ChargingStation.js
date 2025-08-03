const mongoose = require("mongoose")

const chargingStationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Station name is required"],
      trim: true,
    },
    network: {
      type: String,
      required: [true, "Network is required"],
      enum: ["Tesla", "ChargePoint", "Electrify America", "EVgo", "Blink", "Other"],
    },
    location: {
      address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, default: "USA" },
      },
      coordinates: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true }, // [longitude, latitude]
      },
    },
    connectors: [
      {
        type: {
          type: String,
          required: true,
          enum: ["CCS", "CHAdeMO", "Tesla", "Type2", "J1772"],
        },
        power_kw: {
          type: Number,
          required: true,
          min: [1, "Power must be at least 1kW"],
        },
        count: {
          type: Number,
          required: true,
          min: [1, "Must have at least 1 connector"],
        },
        available: {
          type: Number,
          required: true,
          min: [0, "Available count cannot be negative"],
        },
        status: {
          type: String,
          enum: ["operational", "maintenance", "offline"],
          default: "operational",
        },
      },
    ],
    amenities: [
      {
        type: String,
        enum: [
          "restroom",
          "restaurant",
          "shopping",
          "wifi",
          "parking",
          "covered",
          "lighting",
          "24_7",
          "security",
          "lounge",
        ],
      },
    ],
    pricing: {
      per_kwh: { type: Number, min: 0 },
      per_minute: { type: Number, min: 0 },
      session_fee: { type: Number, min: 0, default: 0 },
      idle_fee: { type: Number, min: 0, default: 0 },
      membership_required: { type: Boolean, default: false },
    },
    hours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String },
      is_24_7: { type: Boolean, default: false },
    },
    ratings: {
      overall: { type: Number, min: 0, max: 5, default: 0 },
      reliability: { type: Number, min: 0, max: 5, default: 0 },
      speed: { type: Number, min: 0, max: 5, default: 0 },
      amenities: { type: Number, min: 0, max: 5, default: 0 },
      review_count: { type: Number, default: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastStatusUpdate: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      views: { type: Number, default: 0 },
      check_ins: { type: Number, default: 0 },
      reports: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
)

// Geospatial index for location-based queries
chargingStationSchema.index({ "location.coordinates": "2dsphere" })
chargingStationSchema.index({ network: 1 })
chargingStationSchema.index({ "connectors.type": 1 })
chargingStationSchema.index({ isActive: 1 })

// Virtual for total connectors
chargingStationSchema.virtual("totalConnectors").get(function () {
  return this.connectors.reduce((total, connector) => total + connector.count, 0)
})

// Virtual for available connectors
chargingStationSchema.virtual("availableConnectors").get(function () {
  return this.connectors.reduce((total, connector) => total + connector.available, 0)
})

// Virtual for max power
chargingStationSchema.virtual("maxPower").get(function () {
  return Math.max(...this.connectors.map((c) => c.power_kw))
})

// Method to find nearby stations
chargingStationSchema.statics.findNearby = function (longitude, latitude, maxDistance = 50000) {
  return this.find({
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance, // in meters
      },
    },
    isActive: true,
  })
}

// Method to update connector availability
chargingStationSchema.methods.updateConnectorAvailability = function (connectorType, available) {
  const connector = this.connectors.find((c) => c.type === connectorType)
  if (connector) {
    connector.available = Math.max(0, Math.min(available, connector.count))
    this.lastStatusUpdate = new Date()
    return this.save()
  }
  throw new Error("Connector type not found")
}

module.exports = mongoose.model("ChargingStation", chargingStationSchema)
