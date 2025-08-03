const jwt = require("jsonwebtoken")
const User = require("../models/User")

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return next()
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select("-password")

    if (user) {
      req.user = user
    }

    next()
  } catch (error) {
    // If token is invalid, just continue without user
    next()
  }
}

module.exports = optionalAuth
