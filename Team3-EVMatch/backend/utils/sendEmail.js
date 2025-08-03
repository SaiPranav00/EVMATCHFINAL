const nodemailer = require("nodemailer")

// Configuration object - can be loaded from environment or config service
const emailConfig = {
  smtp: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: process.env.SMTP_POOL === 'true',
    maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS) || 5,
    maxMessages: parseInt(process.env.SMTP_MAX_MESSAGES) || 100,
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT) || 60000,
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT) || 30000,
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT) || 60000
  },
  sender: {
    name: process.env.FROM_NAME || "EVMatch",
    email: process.env.FROM_EMAIL || "noreply@evmatch.com",
    replyTo: process.env.REPLY_TO_EMAIL
  },
  templates: {
    baseUrl: process.env.TEMPLATE_BASE_URL,
    fallbackColor: process.env.BRAND_COLOR || "#10b981",
    fallbackAppName: process.env.APP_NAME || "EVMatch",
    expiryTimes: {
      emailVerification: process.env.EMAIL_VERIFICATION_EXPIRY || "24 hours",
      passwordReset: process.env.PASSWORD_RESET_EXPIRY || "10 minutes",
      magicLink: process.env.MAGIC_LINK_EXPIRY || "15 minutes"
    }
  },
  features: {
    enableTemplateAPI: process.env.ENABLE_TEMPLATE_API === 'true',
    enableEmailTracking: process.env.ENABLE_EMAIL_TRACKING === 'true',
    enableDeliveryAPI: process.env.ENABLE_DELIVERY_API === 'true',
    enableSpamCheck: process.env.ENABLE_SPAM_CHECK === 'true',
    enableRateLimiting: process.env.ENABLE_EMAIL_RATE_LIMITING === 'true',
    enableAnalytics: process.env.ENABLE_EMAIL_ANALYTICS === 'true',
    enableFallbackProvider: process.env.ENABLE_FALLBACK_PROVIDER === 'true'
  },
  providers: {
    primary: process.env.PRIMARY_EMAIL_PROVIDER || 'smtp',
    fallback: process.env.FALLBACK_EMAIL_PROVIDER,
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY
    },
    ses: {
      region: process.env.AWS_SES_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    mailgun: {
      apiKey: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN
    }
  },
  validation: {
    enableEmailValidation: process.env.ENABLE_EMAIL_VALIDATION === 'true',
    maxSubjectLength: parseInt(process.env.MAX_SUBJECT_LENGTH) || 255,
    maxRecipients: parseInt(process.env.MAX_RECIPIENTS) || 50
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

// Get email templates from external API or local fallback
const getEmailTemplate = async (templateType, data) => {
  // Try external template API first
  if (emailConfig.features.enableTemplateAPI) {
    const externalTemplate = await callExternalAPI(process.env.EMAIL_TEMPLATE_API_URL, {
      templateType,
      data,
      brand: emailConfig.templates.fallbackAppName,
      color: emailConfig.templates.fallbackColor
    })

    if (externalTemplate?.html) {
      return externalTemplate.html
    }
  }

  // Fallback to local templates
  return getLocalTemplate(templateType, data)
}

// Local template fallback with dynamic configuration
const getLocalTemplate = (templateType, data) => {
  const appName = emailConfig.templates.fallbackAppName
  const brandColor = emailConfig.templates.fallbackColor
  const baseUrl = emailConfig.templates.baseUrl || process.env.FRONTEND_URL || 'http://localhost:3000'

  const templateMappings = process.env.TEMPLATE_MAPPINGS ?
    JSON.parse(process.env.TEMPLATE_MAPPINGS) : {}

  const templates = {
    emailVerification: (data) => {
      const expiryTime = emailConfig.templates.expiryTimes.emailVerification
      const customFields = templateMappings.emailVerification || {}

      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${brandColor};">Welcome to ${appName}!</h2>
          <p>Hi ${data.name || 'there'},</p>
          <p>${customFields.welcomeMessage || `Thank you for joining ${appName}. Please verify your email address by clicking the button below:`}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.verificationUrl}" 
               style="background-color: ${brandColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              ${customFields.buttonText || 'Verify Email Address'}
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${data.verificationUrl}">${data.verificationUrl}</a></p>
          <p>${customFields.expiryMessage || `This link will expire in ${expiryTime}.`}</p>
          ${customFields.additionalInfo || ''}
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `
    },

    passwordReset: (data) => {
      const expiryTime = emailConfig.templates.expiryTimes.passwordReset
      const customFields = templateMappings.passwordReset || {}

      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${brandColor};">${customFields.title || 'Password Reset Request'}</h2>
          <p>Hi ${data.name || 'there'},</p>
          <p>${customFields.message || `You requested a password reset for your ${appName} account. Click the button below to reset your password:`}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" 
               style="background-color: ${brandColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              ${customFields.buttonText || 'Reset Password'}
            </a>
          </div>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>
          <p>${customFields.expiryMessage || `This link will expire in ${expiryTime}.`}</p>
          <p>${customFields.securityMessage || "If you didn't request this password reset, please ignore this email."}</p>
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `
    },

    magicLink: (data) => {
      const expiryTime = emailConfig.templates.expiryTimes.magicLink
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${brandColor};">Sign in to ${appName}</h2>
          <p>Hi ${data.name || 'there'},</p>
          <p>Click the button below to sign in to your ${appName} account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.magicUrl}" 
               style="background-color: ${brandColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Sign In
            </a>
          </div>
          <p>This link will expire in ${expiryTime}.</p>
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `
    },

    welcome: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${brandColor};">Welcome to ${appName}!</h2>
        <p>Hi ${data.name},</p>
        <p>Welcome to ${appName}! We're excited to have you on board.</p>
        <p>Here are some things you can do to get started:</p>
        <ul>
          <li>Complete your profile</li>
          <li>Browse our electric vehicle database</li>
          <li>Take the EV matching quiz</li>
          <li>Find charging stations near you</li>
        </ul>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/dashboard" 
             style="background-color: ${brandColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Get Started
          </a>
        </div>
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    `,

    notification: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${brandColor};">${data.title || 'Notification'}</h2>
        <p>Hi ${data.name || 'there'},</p>
        <p>${data.message}</p>
        ${data.actionUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.actionUrl}" 
               style="background-color: ${brandColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              ${data.actionText || 'View Details'}
            </a>
          </div>
        ` : ''}
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    `
  }

  // Add custom templates from environment
  const customTemplates = process.env.CUSTOM_EMAIL_TEMPLATES
  if (customTemplates) {
    try {
      const parsed = JSON.parse(customTemplates)
      Object.assign(templates, parsed)
    } catch (error) {
      console.error('Failed to parse custom email templates:', error)
    }
  }

  return templates[templateType] ? templates[templateType](data) : null
}

// Create transporter with dynamic provider support
const createTransporter = () => {
  const provider = emailConfig.providers.primary

  switch (provider) {
    case 'sendgrid':
      return nodemailer.createTransporter({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: emailConfig.providers.sendgrid.apiKey
        }
      })

    case 'ses':
      return nodemailer.createTransporter({
        SES: {
          region: emailConfig.providers.ses.region,
          accessKeyId: emailConfig.providers.ses.accessKeyId,
          secretAccessKey: emailConfig.providers.ses.secretAccessKey
        }
      })

    case 'mailgun':
      return nodemailer.createTransporter({
        service: 'Mailgun',
        auth: {
          user: emailConfig.providers.mailgun.apiKey,
          pass: emailConfig.providers.mailgun.domain
        }
      })

    case 'smtp':
    default:
      return nodemailer.createTransport(emailConfig.smtp)
  }
}

// Email validation helper
const validateEmailOptions = async (options) => {
  const errors = []

  // Basic validation
  if (!options.to && !options.email) {
    errors.push('Recipient email is required')
  }

  if (!options.subject) {
    errors.push('Subject is required')
  }

  if (options.subject && options.subject.length > emailConfig.validation.maxSubjectLength) {
    errors.push(`Subject cannot exceed ${emailConfig.validation.maxSubjectLength} characters`)
  }

  // External email validation
  if (emailConfig.validation.enableEmailValidation) {
    const validationResult = await callExternalAPI(process.env.EMAIL_VALIDATION_API_URL, {
      email: options.to || options.email,
      checkDeliverability: true
    })

    if (validationResult && !validationResult.valid) {
      errors.push(`Invalid email address: ${validationResult.reason}`)
    }
  }

  // Spam check
  if (emailConfig.features.enableSpamCheck) {
    const spamCheck = await callExternalAPI(process.env.SPAM_CHECK_API_URL, {
      subject: options.subject,
      content: options.html || options.message,
      sender: emailConfig.sender.email
    })

    if (spamCheck?.isSpam) {
      errors.push(`Content flagged as spam: ${spamCheck.reason}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Email validation failed: ${errors.join(', ')}`)
  }

  return true
}

// Rate limiting check
const checkRateLimit = async (recipient) => {
  if (!emailConfig.features.enableRateLimiting) return true

  const rateLimitCheck = await callExternalAPI(process.env.RATE_LIMIT_API_URL, {
    recipient,
    service: 'email',
    action: 'send'
  })

  if (rateLimitCheck && !rateLimitCheck.allowed) {
    throw new Error(`Rate limit exceeded: ${rateLimitCheck.message}`)
  }

  return true
}

// Enhanced email tracking
const trackEmail = async (emailData, info) => {
  if (!emailConfig.features.enableEmailTracking) return

  await callExternalAPI(process.env.EMAIL_TRACKING_API_URL, {
    messageId: info.messageId,
    recipient: emailData.to,
    subject: emailData.subject,
    templateType: emailData.template,
    provider: emailConfig.providers.primary,
    timestamp: new Date().toISOString(),
    status: 'sent'
  })
}

// Email analytics
const logEmailAnalytics = async (options, success, error = null) => {
  if (!emailConfig.features.enableAnalytics) return

  await callExternalAPI(process.env.EMAIL_ANALYTICS_API_URL, {
    event: success ? 'email_sent' : 'email_failed',
    templateType: options.template,
    recipient: options.to || options.email,
    provider: emailConfig.providers.primary,
    error: error?.message,
    timestamp: new Date().toISOString()
  })
}

// Fallback provider
const sendWithFallback = async (mailOptions) => {
  const primaryTransporter = createTransporter()

  try {
    return await primaryTransporter.sendMail(mailOptions)
  } catch (error) {
    console.error('Primary email provider failed:', error)

    if (emailConfig.features.enableFallbackProvider && emailConfig.providers.fallback) {
      console.log('Attempting fallback provider...')

      // Temporarily switch to fallback provider
      const originalProvider = emailConfig.providers.primary
      emailConfig.providers.primary = emailConfig.providers.fallback

      try {
        const fallbackTransporter = createTransporter()
        const result = await fallbackTransporter.sendMail(mailOptions)

        // Log fallback usage
        await callExternalAPI(process.env.FALLBACK_LOG_API_URL, {
          originalProvider: originalProvider,
          fallbackProvider: emailConfig.providers.fallback,
          error: error.message,
          timestamp: new Date().toISOString()
        })

        return result
      } finally {
        // Restore original provider
        emailConfig.providers.primary = originalProvider
      }
    }

    throw error
  }
}

// Main send email function
const sendEmail = async (options) => {
  try {
    // Normalize recipient field
    const recipient = options.to || options.email
    if (!recipient) {
      throw new Error('No recipient specified')
    }

    // Validate email options
    await validateEmailOptions({ ...options, to: recipient })

    // Check rate limiting
    await checkRateLimit(recipient)

    // Generate HTML content
    let htmlContent = options.html || options.message

    if (options.template && options.data) {
      htmlContent = await getEmailTemplate(options.template, options.data)
    }

    if (!htmlContent) {
      throw new Error('No email content provided')
    }

    // Build email options dynamically
    const fromAddress = options.from ||
      `${emailConfig.sender.name} <${emailConfig.sender.email}>`

    const mailOptions = {
      from: fromAddress,
      to: recipient,
      subject: options.subject,
      html: htmlContent
    }

    // Add optional fields
    if (emailConfig.sender.replyTo || options.replyTo) {
      mailOptions.replyTo = options.replyTo || emailConfig.sender.replyTo
    }

    if (options.cc) mailOptions.cc = options.cc
    if (options.bcc) mailOptions.bcc = options.bcc
    if (options.attachments) mailOptions.attachments = options.attachments

    // Add custom headers
    const customHeaders = process.env.CUSTOM_EMAIL_HEADERS
    if (customHeaders) {
      try {
        mailOptions.headers = JSON.parse(customHeaders)
      } catch (error) {
        console.error('Failed to parse custom headers:', error)
      }
    }

    // Send email with fallback support
    const info = await sendWithFallback(mailOptions)

    console.log("✅ Email sent successfully:", info.messageId)

    // Track email
    await trackEmail(mailOptions, info)

    // Log analytics
    await logEmailAnalytics(options, true)

    // Delivery confirmation API
    if (emailConfig.features.enableDeliveryAPI) {
      await callExternalAPI(process.env.DELIVERY_CONFIRMATION_API_URL, {
        messageId: info.messageId,
        recipient,
        status: 'delivered',
        timestamp: new Date().toISOString()
      })
    }

    return {
      success: true,
      messageId: info.messageId,
      recipient,
      provider: emailConfig.providers.primary,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    console.error("❌ Email sending failed:", error)

    // Log error analytics
    await logEmailAnalytics(options, false, error)

    // Error notification API
    if (process.env.EMAIL_ERROR_API_URL) {
      await callExternalAPI(process.env.EMAIL_ERROR_API_URL, {
        error: error.message,
        recipient: options.to || options.email,
        template: options.template,
        timestamp: new Date().toISOString()
      })
    }

    throw error
  }
}

// Bulk email function
const sendBulkEmail = async (recipients, template, data, subject) => {
  const results = []
  const batchSize = parseInt(process.env.BULK_EMAIL_BATCH_SIZE) || 10

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize)

    const batchPromises = batch.map(recipient =>
      sendEmail({
        to: recipient,
        subject,
        template,
        data: { ...data, email: recipient }
      }).catch(error => ({ error: error.message, recipient }))
    )

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    // Rate limiting delay between batches
    if (i + batchSize < recipients.length) {
      const delay = parseInt(process.env.BULK_EMAIL_DELAY) || 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return results
}

// Email template preview function
const previewTemplate = async (templateType, data) => {
  const html = await getEmailTemplate(templateType, data)
  return { html, templateType, data }
}

// Health check function
const healthCheck = async () => {
  try {
    const transporter = createTransporter()
    await transporter.verify()

    return {
      status: 'healthy',
      provider: emailConfig.providers.primary,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      provider: emailConfig.providers.primary,
      timestamp: new Date().toISOString()
    }
  }
}

module.exports = {
  sendEmail,
  sendBulkEmail,
  previewTemplate,
  healthCheck
}
