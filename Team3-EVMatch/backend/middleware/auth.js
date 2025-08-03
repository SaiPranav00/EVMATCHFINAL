const jwt = require("jsonwebtoken")
const User = require("../models/User")

// Configuration object that can be set via environment or config file
const authConfig = {
  tokenSources: process.env.TOKEN_SOURCES?.split(',') || ['header', 'cookie'],
  userSelectFields: process.env.USER_SELECT_FIELDS || '-password -__v',
  statusField: process.env.USER_STATUS_FIELD || 'isActive',
  requiredStatus: process.env.USER_REQUIRED_STATUS !== 'false',
  jwtSecret: process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET,
  tokenPrefixes: process.env.TOKEN_PREFIXES?.split(',') || ['Bearer ', 'Token '],
  errorCodes: {
    NO_TOKEN: process.env.NO_TOKEN_CODE || 'NO_TOKEN',
    INVALID_TOKEN: process.env.INVALID_TOKEN_CODE || 'INVALID_TOKEN',
    USER_NOT_FOUND: process.env.USER_NOT_FOUND_CODE || 'USER_NOT_FOUND',
    ACCOUNT_INACTIVE: process.env.ACCOUNT_INACTIVE_CODE || 'ACCOUNT_INACTIVE'
  }
}

// Helper function to extract token from multiple sources
const extractToken = (req, sources, prefixes) => {
  for (const source of sources) {
    let token = null
    
    switch (source) {
      case 'header':
        const authHeader = req.header("Authorization")
        if (authHeader) {
          for (const prefix of prefixes) {
            if (authHeader.startsWith(prefix)) {
              token = authHeader.substring(prefix.length)
              break
            }
          }
        }
        break
        
      case 'cookie':
        token = req.cookies?.token || req.cookies?.authToken
        break
        
      case 'query':
        token = req.query.token || req.query.access_token
        break
        
      case 'body':
        token = req.body?.token
        break
    }
    
    if (token) return token
  }
  return null
}

// Main authentication middleware
const auth = async (req, res, next) => {
  try {
    // Dynamic token extraction
    const token = extractToken(req, authConfig.tokenSources, authConfig.tokenPrefixes)

    if (!token) {
      return res.status(401).json({
        success: false,
        message: req.__(
          'auth.no_token', 
          'Access denied. No authentication token provided.'
        ),
        code: authConfig.errorCodes.NO_TOKEN,
        timestamp: new Date().toISOString()
      })
    }

    // Verify token with configurable secret
    if (!authConfig.jwtSecret) {
      console.error('JWT Secret not configured')
      return res.status(500).json({
        success: false,
        message: 'Authentication service configuration error',
        code: 'CONFIG_ERROR'
      })
    }

    const decoded = jwt.verify(token, authConfig.jwtSecret)
    
    // Dynamic user field selection
    const user = await User.findById(decoded.id || decoded.userId)
      .select(authConfig.userSelectFields)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: req.__(
          'auth.user_not_found', 
          'Invalid token. User not found.'
        ),
        code: authConfig.errorCodes.USER_NOT_FOUND,
        timestamp: new Date().toISOString()
      })
    }

    // Dynamic status checking
    if (authConfig.requiredStatus && user[authConfig.statusField] !== true) {
      return res.status(401).json({
        success: false,
        message: req.__(
          'auth.account_inactive', 
          'User account is not accessible'
        ),
        code: authConfig.errorCodes.ACCOUNT_INACTIVE,
        timestamp: new Date().toISOString()
      })
    }

    // API call to validate token with external service (if configured)
    if (process.env.EXTERNAL_AUTH_VALIDATION_URL) {
      try {
        const validationResponse = await fetch(process.env.EXTERNAL_AUTH_VALIDATION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: user._id,
            token: token
          })
        })

        if (!validationResponse.ok) {
          return res.status(401).json({
            success: false,
            message: 'Token validation failed',
            code: 'EXTERNAL_VALIDATION_FAILED'
          })
        }
      } catch (validationError) {
        console.error('External validation error:', validationError)
        // Continue without external validation in case of service failure
      }
    }

    // Dynamic user object construction
    const userFields = process.env.USER_RESPONSE_FIELDS?.split(',') || 
      ['userId', 'email', 'role']
    
    req.user = {}
    
    // Map fields dynamically
    if (userFields.includes('userId')) req.user.userId = user._id
    if (userFields.includes('email')) req.user.email = user.email
    if (userFields.includes('role')) req.user.role = user.role
    if (userFields.includes('department') && user.department) req.user.department = user.department
    if (userFields.includes('organization') && user.organization) req.user.organization = user.organization
    if (userFields.includes('permissions') && user.permissions) req.user.permissions = user.permissions

    // Add token metadata
    req.tokenInfo = {
      issuedAt: decoded.iat,
      expiresAt: decoded.exp,
      issuer: decoded.iss || 'local',
      tokenId: decoded.jti
    }

    // Log authentication for audit (if enabled)
    if (process.env.ENABLE_AUTH_LOGGING === 'true') {
      console.log('Authentication successful:', {
        userId: user._id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      })
    }

    next()
  } catch (error) {
    // Dynamic error handling
    const errorMap = {
      'JsonWebTokenError': {
        status: 401,
        message: req.__('auth.invalid_token', 'Invalid token format or signature'),
        code: authConfig.errorCodes.INVALID_TOKEN
      },
      'TokenExpiredError': {
        status: 401,
        message: req.__('auth.token_expired', 'Token has expired'),
        code: 'TOKEN_EXPIRED'
      },
      'NotBeforeError': {
        status: 401,
        message: req.__('auth.token_not_active', 'Token not active yet'),
        code: 'TOKEN_NOT_ACTIVE'
      }
    }

    const errorResponse = errorMap[error.name]
    
    if (errorResponse) {
      return res.status(errorResponse.status).json({
        success: false,
        message: errorResponse.message,
        code: errorResponse.code,
        timestamp: new Date().toISOString()
      })
    }

    // Enhanced error logging
    console.error('Auth middleware error:', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    })

    // API call to log error (if configured)
    if (process.env.ERROR_LOGGING_API_URL) {
      try {
        await fetch(process.env.ERROR_LOGGING_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: 'auth-middleware',
            error: error.message,
            timestamp: new Date().toISOString(),
            metadata: {
              ip: req.ip,
              path: req.path,
              userAgent: req.get('User-Agent')
            }
          })
        })
      } catch (logError) {
        console.error('Failed to log error to external service:', logError)
      }
    }

    res.status(500).json({
      success: false,
      message: req.__('auth.server_error', 'Authentication service unavailable'),
      code: 'AUTH_SERVICE_ERROR',
      timestamp: new Date().toISOString()
    })
  }
}

// Factory function for role-based authentication
const createRoleAuth = (requiredRoles = []) => {
  return async (req, res, next) => {
    await auth(req, res, () => {
      if (requiredRoles.length > 0 && !requiredRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          code: 'INSUFFICIENT_ROLE',
          required: requiredRoles,
          current: req.user.role
        })
      }
      next()
    })
  }
}

module.exports = { auth, createRoleAuth }
