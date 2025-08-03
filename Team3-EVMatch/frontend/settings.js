// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000/api"

// API Helper Functions
const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      },
      ...options
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`)
    }
    
    return data
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error)
    throw error
  }
}

// Global variables
let currentUser = null
let authToken = null
let settings = {} // Will be populated from API

// Initialize settings page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing settings page...")
  
  try {
    // Show loading state
    showLoadingState()
    
    await checkAuthentication()
    await loadSettings()
    setupEventListeners()
    
    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize settings page:", error)
    hideLoadingState()
    showErrorMessage("Failed to load settings page. Please try again.")
  }
})

// Check authentication - API integrated
async function checkAuthentication() {
  authToken = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  if (!authToken) {
    console.log("No token found, redirecting to login")
    window.location.href = "index.html?message=Please sign in to access your settings"
    return
  }

  try {
    // Verify token with API
    const response = await apiRequest('/auth/me', {
      method: 'GET'
    })

    if (response.success) {
      currentUser = response.data.user
      console.log("User authenticated successfully:", currentUser.email)
      
      // Update stored user data
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))
    } else {
      throw new Error(response.message || 'Authentication failed')
    }
  } catch (error) {
    console.error("Authentication check failed:", error)
    
    // Clear invalid token and redirect
    clearAuthData()
    window.location.href = "index.html?message=Session expired. Please sign in again."
  }
}

// Load settings - API integrated
async function loadSettings() {
  try {
    console.log("Loading settings from API...")
    
    const response = await apiRequest('/users/settings', {
      method: 'GET'
    })

    if (response.success) {
      settings = response.data.settings || {}
      console.log("Settings loaded successfully:", Object.keys(settings))
      
      // Cache settings
      cacheSettings(settings)
    } else {
      throw new Error(response.message || 'Failed to load settings')
    }
  } catch (error) {
    console.error("Failed to load settings:", error)
    
    // Try to load from cache
    const cachedSettings = getCachedSettings()
    if (cachedSettings) {
      console.log("Using cached settings")
      settings = cachedSettings
    } else {
      // Set default settings if no cache available
      settings = getDefaultSettings()
      console.log("Using default settings")
    }
  }

  // Update UI with current settings
  updateSettingsUI()
}

// Get default settings
function getDefaultSettings() {
  return {
    emailNotifications: true,
    priceAlerts: true,
    newVehicleAlerts: false,
    profileVisibility: false,
    analytics: true,
    marketing: false,
    theme: 'light',
    language: 'en',
    currency: 'USD',
    units: 'metric',
    dataSharing: false,
    twoFactorAuth: false
  }
}

// Cache settings for offline use
function cacheSettings(settingsData) {
  try {
    localStorage.setItem('cachedUserSettings', JSON.stringify(settingsData))
    localStorage.setItem('cachedSettingsTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache settings:", error)
  }
}

// Get cached settings
function getCachedSettings() {
  try {
    const cached = localStorage.getItem('cachedUserSettings')
    const timestamp = localStorage.getItem('cachedSettingsTimestamp')
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      const maxAge = 30 * 60 * 1000 // 30 minutes
      
      if (age < maxAge) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    console.warn("Failed to get cached settings:", error)
  }
  
  return null
}

// Update settings UI
function updateSettingsUI() {
  console.log("Updating settings UI with:", settings)

  // Update toggle switches
  Object.keys(settings).forEach((key) => {
    const toggle = document.querySelector(`[data-setting="${key}"]`) || 
                   document.querySelector(`[onclick*="${key}"]`)
    if (toggle) {
      if (settings[key]) {
        toggle.classList.add("active")
      } else {
        toggle.classList.remove("active")
      }
    }
  })

  // Update form inputs
  updateFormInputs()
  
  // Update preference displays
  updatePreferenceDisplays()
}

// Update form inputs
function updateFormInputs() {
  const inputs = {
    language: settings.language || currentUser?.preferences?.language || 'en',
    currency: settings.currency || currentUser?.preferences?.currency || 'USD',
    units: settings.units || currentUser?.preferences?.units || 'metric',
    theme: settings.theme || 'light'
  }

  Object.entries(inputs).forEach(([key, value]) => {
    const element = document.getElementById(key)
    if (element) {
      element.value = value
    }
  })
}

// Update preference displays
function updatePreferenceDisplays() {
  // Update display elements that show current preferences
  const displays = {
    currentLanguage: getLanguageDisplay(settings.language || 'en'),
    currentCurrency: settings.currency || 'USD',
    currentUnits: settings.units || 'metric',
    currentTheme: settings.theme || 'light'
  }

  Object.entries(displays).forEach(([elementId, value]) => {
    const element = document.getElementById(elementId)
    if (element) {
      element.textContent = value
    }
  })
}

// Get language display name
function getLanguageDisplay(code) {
  const languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic'
  }
  return languages[code] || 'English'
}

// Setup event listeners
function setupEventListeners() {
  const passwordForm = document.getElementById("passwordForm")
  const preferencesForm = document.getElementById("preferencesForm")
  const dataExportBtn = document.getElementById("exportDataBtn")
  const twoFactorBtn = document.getElementById("twoFactorBtn")

  if (passwordForm) {
    passwordForm.addEventListener("submit", handlePasswordChange)
  }
  
  if (preferencesForm) {
    preferencesForm.addEventListener("submit", handlePreferencesChange)
  }

  if (dataExportBtn) {
    dataExportBtn.addEventListener("click", handleDataExport)
  }

  if (twoFactorBtn) {
    twoFactorBtn.addEventListener("click", handleTwoFactorToggle)
  }

  // Setup notification test buttons
  setupNotificationTests()
}

// Setup notification test buttons
function setupNotificationTests() {
  const testButtons = {
    testEmailBtn: () => testNotification('email'),
    testPushBtn: () => testNotification('push'),
    testSMSBtn: () => testNotification('sms')
  }

  Object.entries(testButtons).forEach(([id, handler]) => {
    const button = document.getElementById(id)
    if (button) {
      button.addEventListener('click', handler)
    }
  })
}

// Toggle setting - API integrated
async function toggleSetting(element, settingKey) {
  const isActive = element.classList.contains("active")
  const newValue = !isActive

  // Show loading state on toggle
  element.style.opacity = '0.5'
  element.style.pointerEvents = 'none'

  try {
    const response = await apiRequest('/users/settings', {
      method: 'PUT',
      body: JSON.stringify({
        [settingKey]: newValue
      })
    })

    if (response.success) {
      settings[settingKey] = newValue
      if (newValue) {
        element.classList.add("active")
      } else {
        element.classList.remove("active")
      }
      
      // Cache updated settings
      cacheSettings(settings)
      
      showSuccessMessage("Setting updated successfully!")
      
      // Track activity
      await trackActivity('setting_changed', { setting: settingKey, value: newValue })
    } else {
      throw new Error(response.message || 'Failed to update setting')
    }
  } catch (error) {
    console.error("Setting update error:", error)
    showErrorMessage("Failed to update setting. Please try again.")
  } finally {
    // Reset loading state
    element.style.opacity = '1'
    element.style.pointerEvents = 'auto'
  }
}

// Handle password change - API integrated
async function handlePasswordChange(e) {
  e.preventDefault()

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Changing Password...'
  submitBtn.disabled = true

  const currentPassword = document.getElementById("currentPassword").value
  const newPassword = document.getElementById("newPassword").value
  const confirmPassword = document.getElementById("confirmPassword").value

  // Client-side validation
  if (newPassword !== confirmPassword) {
    showErrorMessage("New passwords do not match")
    resetSubmitButton(submitBtn, originalText)
    return
  }

  if (newPassword.length < 8) {
    showErrorMessage("Password must be at least 8 characters long")
    resetSubmitButton(submitBtn, originalText)
    return
  }

  // Password strength check
  if (!isPasswordStrong(newPassword)) {
    showErrorMessage("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
    resetSubmitButton(submitBtn, originalText)
    return
  }

  try {
    const response = await apiRequest('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    })

    if (response.success) {
      showSuccessMessage("Password changed successfully!")
      e.target.reset()
      
      // Track activity
      await trackActivity('password_changed')
    } else {
      throw new Error(response.message || 'Failed to change password')
    }
  } catch (error) {
    console.error("Password change error:", error)
    showErrorMessage("Failed to change password. Please check your current password and try again.")
  } finally {
    resetSubmitButton(submitBtn, originalText)
  }
}

// Check password strength
function isPasswordStrong(password) {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasNonalphas = /\W/.test(password)

  return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasNonalphas
}

// Handle preferences change - API integrated
async function handlePreferencesChange(e) {
  e.preventDefault()

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'
  submitBtn.disabled = true

  const formData = new FormData(e.target)
  const preferences = {
    language: formData.get("language") || document.getElementById("language").value,
    currency: formData.get("currency") || document.getElementById("currency").value,
    units: formData.get("units") || document.getElementById("units").value,
    theme: formData.get("theme") || document.getElementById("theme").value
  }

  try {
    const response = await apiRequest('/users/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences })
    })

    if (response.success) {
      // Update stored user data
      currentUser.preferences = { ...currentUser.preferences, ...preferences }
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))

      // Update settings object
      settings = { ...settings, ...preferences }
      cacheSettings(settings)

      showSuccessMessage("Preferences saved successfully!")
      
      // Track activity
      await trackActivity('preferences_updated', preferences)
      
      // Apply theme change immediately
      if (preferences.theme) {
        applyTheme(preferences.theme)
      }
    } else {
      throw new Error(response.message || 'Failed to save preferences')
    }
  } catch (error) {
    console.error("Preferences update error:", error)
    showErrorMessage("Failed to save preferences. Please try again.")
  } finally {
    resetSubmitButton(submitBtn, originalText)
  }
}

// Apply theme
function applyTheme(theme) {
  document.body.className = document.body.className.replace(/theme-\w+/, '')
  document.body.classList.add(`theme-${theme}`)
}

// Handle data export - API integrated
async function handleDataExport() {
  try {
    showLoadingMessage("Preparing your data export...")
    
    const response = await apiRequest('/users/export-data', {
      method: 'POST'
    })

    if (response.success) {
      if (response.data.downloadUrl) {
        // Direct download
        const link = document.createElement('a')
        link.href = response.data.downloadUrl
        link.download = `evmatch-data-${new Date().toISOString().split('T')[0]}.json`
        link.click()
        
        showSuccessMessage("Data export downloaded successfully!")
      } else {
        // Email notification
        showSuccessMessage("Data export will be sent to your email within 24 hours.")
      }
      
      // Track activity
      await trackActivity('data_exported')
    } else {
      throw new Error(response.message || 'Failed to export data')
    }
  } catch (error) {
    console.error("Data export error:", error)
    showErrorMessage("Failed to export data. Please try again.")
  }
}

// Handle two-factor authentication toggle - API integrated
async function handleTwoFactorToggle() {
  try {
    const isEnabled = settings.twoFactorAuth
    
    if (isEnabled) {
      // Disable 2FA
      const confirmed = confirm("Are you sure you want to disable two-factor authentication? This will make your account less secure.")
      if (!confirmed) return
      
      const response = await apiRequest('/auth/2fa/disable', {
        method: 'POST'
      })
      
      if (response.success) {
        settings.twoFactorAuth = false
        updateSettingsUI()
        showSuccessMessage("Two-factor authentication disabled.")
        
        await trackActivity('2fa_disabled')
      }
    } else {
      // Enable 2FA - redirect to setup
      window.location.href = 'two-factor-setup.html'
    }
  } catch (error) {
    console.error("Two-factor toggle error:", error)
    showErrorMessage("Failed to update two-factor authentication. Please try again.")
  }
}

// Test notifications - API integrated
async function testNotification(type) {
  try {
    const response = await apiRequest('/users/test-notification', {
      method: 'POST',
      body: JSON.stringify({ type })
    })

    if (response.success) {
      showSuccessMessage(`Test ${type} notification sent successfully!`)
      
      await trackActivity('notification_tested', { type })
    } else {
      throw new Error(response.message || `Failed to send test ${type}`)
    }
  } catch (error) {
    console.error("Test notification error:", error)
    showErrorMessage(`Failed to send test ${type}. Please try again.`)
  }
}

// Confirm delete account
function confirmDeleteAccount() {
  const modal = document.getElementById('deleteAccountModal')
  if (modal) {
    modal.style.display = 'block'
  } else {
    // Fallback to prompt
    const confirmation = prompt('This action cannot be undone. Type "DELETE" to confirm account deletion:')
    
    if (confirmation === "DELETE") {
      deleteAccount()
    } else if (confirmation !== null) {
      showErrorMessage("Account deletion cancelled - confirmation text did not match")
    }
  }
}

// Delete account - API integrated
async function deleteAccount() {
  try {
    // Show loading state
    showLoadingMessage("Deleting your account...")
    
    const response = await apiRequest('/users/account', {
      method: 'DELETE'
    })

    if (response.success) {
      // Clear all data
      clearAllData()
      
      showSuccessMessage("Your account has been permanently deleted.")
      
      setTimeout(() => {
        window.location.href = "index.html?message=Account deleted successfully"
      }, 2000)
    } else {
      throw new Error(response.message || 'Failed to delete account')
    }
  } catch (error) {
    console.error("Account deletion error:", error)
    showErrorMessage("Failed to delete account. Please try again or contact support.")
  }
}

// Clear all data
function clearAllData() {
  localStorage.clear()
  sessionStorage.clear()
  
  // Clear service worker cache if available
  if ('serviceWorker' in navigator && 'caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name))
    })
  }
}

// Track user activity - API integrated
async function trackActivity(type, details = {}) {
  try {
    await apiRequest('/users/activity', {
      method: 'POST',
      body: JSON.stringify({
        type: 'settings_' + type,
        details,
        timestamp: new Date().toISOString()
      })
    })
  } catch (error) {
    console.error("Failed to track activity:", error)
    // Don't throw error as this is not critical
  }
}

// Clear authentication data
function clearAuthData() {
  localStorage.removeItem("authToken")
  sessionStorage.removeItem("authToken")
  localStorage.removeItem("user")
  sessionStorage.removeItem("user")
  
  // Clear cached data
  localStorage.removeItem("cachedUserSettings")
}

// Navigation functions
function goToDashboard() {
  window.location.href = "dashboard.html"
}

function goToProfile() {
  window.location.href = "profile.html"
}

// Utility functions
function resetSubmitButton(button, originalText) {
  button.innerHTML = originalText
  button.disabled = false
}

// Loading states
function showLoadingState() {
  const container = document.querySelector('.settings-container') || document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'settingsLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">Loading your settings...</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('settingsLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
}

function showLoadingMessage(message) {
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'tempLoadingMessage'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.95); padding: 2rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 9999; text-align: center;">
      <div class="loading-spinner"></div>
      <p style="margin-top: 1rem; color: #6b7280;">${message}</p>
    </div>
  `
  
  document.body.appendChild(loadingDiv)
  
  setTimeout(() => {
    const temp = document.getElementById('tempLoadingMessage')
    if (temp) temp.remove()
  }, 10000) // Auto-remove after 10 seconds
}

// Message functions - Enhanced
function showSuccessMessage(message) {
  const successDiv = document.createElement("div")
  successDiv.className = "success-message"
  successDiv.style.cssText = `
    background: #d1fae5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    padding: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    min-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideInRight 0.3s ease-out;
  `
  successDiv.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `

  document.body.appendChild(successDiv)

  setTimeout(() => {
    successDiv.style.animation = 'slideOutRight 0.3s ease-out'
    setTimeout(() => successDiv.remove(), 300)
  }, 3000)
}

function showErrorMessage(message) {
  const errorDiv = document.createElement("div")
  errorDiv.className = "error-message"
  errorDiv.style.cssText = `
    background: #fed7d7;
    border: 1px solid #feb2b2;
    color: #c53030;
    padding: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    min-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideInRight 0.3s ease-out;
  `
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `

  document.body.appendChild(errorDiv)

  setTimeout(() => {
    errorDiv.style.animation = 'slideOutRight 0.3s ease-out'
    setTimeout(() => errorDiv.remove(), 300)
  }, 5000)
}

// Add CSS for loading spinner and animations
const style = document.createElement("style")
style.textContent = `
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
  
  .theme-dark {
    background-color: #1a1a1a;
    color: #ffffff;
  }
  
  .theme-light {
    background-color: #ffffff;
    color: #000000;
  }
`
document.head.appendChild(style)

// Export functions for use in other files
window.settingsSystem = {
  loadSettings,
  toggleSetting,
  trackActivity,
  getCurrentSettings: () => settings,
  applyTheme
}

console.log("Settings.js loaded successfully with API integration")
