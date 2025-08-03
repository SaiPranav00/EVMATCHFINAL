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

// Initialize profile page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing profile page...")
  
  try {
    // Show loading state
    showLoadingState()
    
    await checkAuthentication()
    await loadUserProfile()
    setupEventListeners()
    
    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize profile page:", error)
    hideLoadingState()
    showErrorMessage("Failed to load profile page. Please try again.")
  }
})

// Check authentication - API integrated
async function checkAuthentication() {
  authToken = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  if (!authToken) {
    console.log("No token found, redirecting to login")
    window.location.href = "index.html?message=Please sign in to access your profile"
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

// Load user profile data - API integrated
async function loadUserProfile() {
  if (!currentUser) return

  try {
    console.log("Loading full profile data from API...")
    
    // Get complete profile data from API
    const response = await apiRequest('/users/profile', {
      method: 'GET'
    })

    if (response.success) {
      // Merge API data with current user data
      currentUser = { ...currentUser, ...response.data.profile }
      
      // Cache the updated profile
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))
      
      console.log("Profile data loaded successfully")
    }
  } catch (error) {
    console.error("Failed to load profile from API:", error)
    console.log("Using cached profile data")
  }

  // Update UI with profile data
  updateProfileUI()
}

// Update profile UI
function updateProfileUI() {
  try {
    // Update profile header
    const profileName = document.getElementById("profileName")
    const profileEmail = document.getElementById("profileEmail")
    const profileInitials = document.getElementById("profileInitials")

    if (profileName) {
      profileName.textContent = getFullName() || "User Name"
    }
    
    if (profileEmail) {
      profileEmail.textContent = currentUser.email || "user@example.com"
    }

    if (profileInitials) {
      const initials = getInitials()
      profileInitials.textContent = initials || "U"
    }

    // Update verification badge
    updateVerificationBadge()

    // Fill form fields
    fillPersonalInfoForm()
    fillPreferencesForm()

    // Update profile avatar if available
    updateProfileAvatar()

  } catch (error) {
    console.error("Error updating profile UI:", error)
  }
}

// Get full name
function getFullName() {
  const firstName = currentUser.firstName || ""
  const lastName = currentUser.lastName || ""
  return `${firstName} ${lastName}`.trim()
}

// Get initials
function getInitials() {
  const firstName = currentUser.firstName || ""
  const lastName = currentUser.lastName || ""
  return (firstName[0] || "") + (lastName[0] || "")
}

// Update verification badge
function updateVerificationBadge() {
  const verificationBadge = document.getElementById("verificationBadge")
  if (!verificationBadge) return

  if (currentUser.isEmailVerified) {
    verificationBadge.innerHTML = '<i class="fas fa-check-circle"></i><span>Email Verified</span>'
    verificationBadge.className = "verification-badge"
  } else {
    verificationBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Email Not Verified</span>'
    verificationBadge.className = "verification-badge unverified"
  }
}

// Fill personal info form
function fillPersonalInfoForm() {
  const fields = {
    firstName: currentUser.firstName || "",
    lastName: currentUser.lastName || "",
    email: currentUser.email || "",
    phone: currentUser.phone || "",
    address: currentUser.address || "",
    dateOfBirth: currentUser.dateOfBirth || "",
    gender: currentUser.gender || ""
  }

  Object.entries(fields).forEach(([fieldName, value]) => {
    const element = document.getElementById(fieldName)
    if (element) {
      element.value = value
    }
  })
}

// Fill preferences form
function fillPreferencesForm() {
  const preferences = currentUser.preferences || {}
  
  const preferenceFields = {
    budget: preferences.budget || "",
    range: preferences.range || "",
    bodyType: preferences.bodyType || "",
    fuelType: preferences.fuelType || "",
    transmission: preferences.transmission || ""
  }

  Object.entries(preferenceFields).forEach(([fieldName, value]) => {
    const element = document.getElementById(fieldName)
    if (element) {
      element.value = value
    }
  })

  // Handle multi-select features
  const featuresElement = document.getElementById("features")
  if (featuresElement && preferences.features) {
    Array.from(featuresElement.options).forEach(option => {
      option.selected = preferences.features.includes(option.value)
    })
  }
}

// Update profile avatar
function updateProfileAvatar() {
  const avatarElement = document.getElementById("profileAvatar")
  if (!avatarElement) return

  if (currentUser.profileImage) {
    avatarElement.style.backgroundImage = `url(${currentUser.profileImage})`
    avatarElement.style.backgroundSize = "cover"
    avatarElement.style.backgroundPosition = "center"
    avatarElement.innerHTML = '<button class="avatar-upload" onclick="uploadAvatar()"><i class="fas fa-camera"></i></button>'
  }
}

// Setup event listeners
function setupEventListeners() {
  const personalInfoForm = document.getElementById("personalInfoForm")
  const preferencesForm = document.getElementById("preferencesForm")
  const avatarInput = document.getElementById("avatarInput")
  const changePasswordForm = document.getElementById("changePasswordForm")

  if (personalInfoForm) {
    personalInfoForm.addEventListener("submit", handlePersonalInfoSubmit)
  }
  
  if (preferencesForm) {
    preferencesForm.addEventListener("submit", handlePreferencesSubmit)
  }
  
  if (avatarInput) {
    avatarInput.addEventListener("change", handleAvatarChange)
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", handlePasswordChange)
  }

  // Email verification button
  const verifyEmailBtn = document.getElementById("verifyEmailBtn")
  if (verifyEmailBtn) {
    verifyEmailBtn.addEventListener("click", handleEmailVerification)
  }
}

// Handle personal info form submission - API integrated
async function handlePersonalInfoSubmit(e) {
  e.preventDefault()

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...'
  submitBtn.disabled = true

  const formData = new FormData(e.target)
  const updatedData = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    dateOfBirth: formData.get("dateOfBirth"),
    gender: formData.get("gender")
  }

  try {
    const response = await apiRequest('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(updatedData)
    })

    if (response.success) {
      // Update stored user data
      currentUser = { ...currentUser, ...updatedData, ...response.data.user }
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))

      showSuccessMessage("Personal information updated successfully!")
      updateProfileUI()
      
      // Track activity
      await trackActivity('profile_update', 'personal_info')
    } else {
      throw new Error(response.message || 'Failed to update profile')
    }
  } catch (error) {
    console.error("Profile update error:", error)
    showErrorMessage("Failed to update personal information. Please try again.")
  } finally {
    // Reset button state
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
  }
}

// Handle preferences form submission - API integrated
async function handlePreferencesSubmit(e) {
  e.preventDefault()

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...'
  submitBtn.disabled = true

  const formData = new FormData(e.target)
  const featuresElement = document.getElementById("features")
  
  const preferences = {
    budget: formData.get("budget"),
    range: formData.get("range"),
    bodyType: formData.get("bodyType"),
    fuelType: formData.get("fuelType"),
    transmission: formData.get("transmission"),
    features: featuresElement ? Array.from(featuresElement.selectedOptions).map(option => option.value) : []
  }

  try {
    const response = await apiRequest('/users/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences })
    })

    if (response.success) {
      currentUser.preferences = preferences
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))

      showSuccessMessage("Preferences updated successfully!")
      
      // Track activity
      await trackActivity('profile_update', 'preferences')
    } else {
      throw new Error(response.message || 'Failed to update preferences')
    }
  } catch (error) {
    console.error("Preferences update error:", error)
    showErrorMessage("Failed to update preferences. Please try again.")
  } finally {
    // Reset button state
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
  }
}

// Handle password change - API integrated
async function handlePasswordChange(e) {
  e.preventDefault()

  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Changing...'
  submitBtn.disabled = true

  const formData = new FormData(e.target)
  const passwordData = {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  }

  // Client-side validation
  if (passwordData.newPassword !== passwordData.confirmPassword) {
    showErrorMessage("New passwords do not match.")
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
    return
  }

  if (passwordData.newPassword.length < 6) {
    showErrorMessage("New password must be at least 6 characters long.")
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
    return
  }

  try {
    const response = await apiRequest('/users/change-password', {
      method: 'POST',
      body: JSON.stringify(passwordData)
    })

    if (response.success) {
      showSuccessMessage("Password changed successfully!")
      e.target.reset()
      
      // Track activity
      await trackActivity('security_update', 'password_change')
    } else {
      throw new Error(response.message || 'Failed to change password')
    }
  } catch (error) {
    console.error("Password change error:", error)
    showErrorMessage("Failed to change password. Please check your current password and try again.")
  } finally {
    // Reset button state
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
  }
}

// Handle email verification - API integrated
async function handleEmailVerification() {
  try {
    const response = await apiRequest('/auth/send-verification', {
      method: 'POST'
    })

    if (response.success) {
      showSuccessMessage("Verification email sent! Please check your inbox.")
    } else {
      throw new Error(response.message || 'Failed to send verification email')
    }
  } catch (error) {
    console.error("Email verification error:", error)
    showErrorMessage("Failed to send verification email. Please try again.")
  }
}

// Upload avatar
function uploadAvatar() {
  document.getElementById("avatarInput").click()
}

// Handle avatar change - API integrated
async function handleAvatarChange(e) {
  const file = e.target.files[0]
  if (!file) return

  // Validate file type and size
  if (!file.type.startsWith('image/')) {
    showErrorMessage("Please select a valid image file.")
    return
  }

  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showErrorMessage("Image file is too large. Please select a file under 5MB.")
    return
  }

  try {
    // Show loading state
    const avatarElement = document.getElementById("profileAvatar")
    avatarElement.innerHTML = '<div class="loading-spinner"></div>'

    // Create FormData for file upload
    const formData = new FormData()
    formData.append('avatar', file)

    const response = await fetch(`${API_BASE_URL}/users/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    })

    const data = await response.json()

    if (data.success) {
      // Update user data with new avatar URL
      currentUser.profileImage = data.data.avatarUrl
      const storage = localStorage.getItem("authToken") ? localStorage : sessionStorage
      storage.setItem("user", JSON.stringify(currentUser))

      // Update UI
      updateProfileAvatar()
      
      showSuccessMessage("Avatar updated successfully!")
      
      // Track activity
      await trackActivity('profile_update', 'avatar')
    } else {
      throw new Error(data.message || 'Failed to upload avatar')
    }
  } catch (error) {
    console.error("Avatar upload error:", error)
    showErrorMessage("Failed to upload avatar. Please try again.")
    
    // Reset avatar element
    updateProfileAvatar()
  }
}

// Track user activity - API integrated
async function trackActivity(type, details) {
  try {
    await apiRequest('/users/activity', {
      method: 'POST',
      body: JSON.stringify({
        type,
        details,
        timestamp: new Date().toISOString()
      })
    })
  } catch (error) {
    console.error("Failed to track activity:", error)
    // Don't throw error as this is not critical
  }
}

// Delete account - API integrated
async function deleteAccount() {
  const confirmed = confirm(
    "Are you sure you want to delete your account? This action cannot be undone."
  )
  
  if (!confirmed) return

  const doubleConfirm = confirm(
    "This will permanently delete all your data including favorites, comparisons, and preferences. Are you absolutely sure?"
  )
  
  if (!doubleConfirm) return

  try {
    const response = await apiRequest('/users/account', {
      method: 'DELETE'
    })

    if (response.success) {
      showSuccessMessage("Account deleted successfully. You will be redirected to the home page.")
      
      // Clear all data
      clearAuthData()
      
      setTimeout(() => {
        window.location.href = "index.html"
      }, 2000)
    } else {
      throw new Error(response.message || 'Failed to delete account')
    }
  } catch (error) {
    console.error("Account deletion error:", error)
    showErrorMessage("Failed to delete account. Please try again or contact support.")
  }
}

// Navigation functions
function goToDashboard() {
  window.location.href = "dashboard.html"
}

function goToFavorites() {
  window.location.href = "favorites.html"
}

function goToSettings() {
  window.location.href = "settings.html"
}

// Clear authentication data
function clearAuthData() {
  localStorage.removeItem("authToken")
  sessionStorage.removeItem("authToken")
  localStorage.removeItem("user")
  sessionStorage.removeItem("user")
  
  // Clear cached data
  localStorage.removeItem("cachedUserProfile")
}

// Loading states
function showLoadingState() {
  const container = document.querySelector('.profile-container') || document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'profileLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">Loading your profile...</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('profileLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
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
`
document.head.appendChild(style)

// Export functions for use in other files
window.profileSystem = {
  loadUserProfile,
  trackActivity,
  getCurrentUser: () => currentUser,
  updateProfileUI
}

console.log("Profile.js loaded successfully with API integration")
