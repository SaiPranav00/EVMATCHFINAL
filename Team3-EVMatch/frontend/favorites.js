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
let favorites = []

// Initialize favorites page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing favorites page...")
  
  try {
    // Show loading state
    showLoadingState()
    
    await checkAuthentication()
    await loadFavorites()
    
    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize favorites page:", error)
    hideLoadingState()
    showErrorMessage("Failed to load favorites page. Please try again.")
  }
})

// Check authentication - API integrated
async function checkAuthentication() {
  authToken = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  if (!authToken) {
    console.log("No token found, redirecting to login")
    window.location.href = "index.html?message=Please sign in to view your favorites"
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
      
      updateUserInterface()
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

// Update user interface
function updateUserInterface() {
  if (!currentUser) return

  // Update user name if element exists
  const userName = document.getElementById("userName")
  if (userName) {
    userName.textContent = currentUser.firstName || "User"
  }

  // Update user initials if element exists
  const userInitials = document.getElementById("userInitials")
  if (userInitials) {
    const initials = (currentUser.firstName?.[0] || "") + (currentUser.lastName?.[0] || "")
    userInitials.textContent = initials || "U"
  }
}

// Load favorites - API integrated
async function loadFavorites() {
  try {
    console.log("Loading favorites from API...")
    
    const response = await apiRequest('/users/favorites', {
      method: 'GET'
    })

    if (response.success) {
      favorites = response.data.favorites || []
      console.log(`Loaded ${favorites.length} favorites from API`)
      
      // Cache favorites
      cacheFavorites(favorites)
      
      displayFavorites()
    } else {
      throw new Error(response.message || 'Failed to load favorites')
    }
  } catch (error) {
    console.error("Failed to load favorites:", error)
    
    // Try to load from cache
    const cachedFavorites = getCachedFavorites()
    if (cachedFavorites) {
      console.log("Using cached favorites")
      favorites = cachedFavorites
      displayFavorites()
    } else {
      // Show empty state
      favorites = []
      displayFavorites()
      showErrorMessage("Failed to load favorites. Please check your connection and try again.")
    }
  }
}

// Cache favorites for offline use
function cacheFavorites(favoritesData) {
  try {
    localStorage.setItem('cachedFavorites', JSON.stringify(favoritesData))
    localStorage.setItem('cachedFavoritesTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache favorites:", error)
  }
}

// Get cached favorites
function getCachedFavorites() {
  try {
    const cached = localStorage.getItem('cachedFavorites')
    const timestamp = localStorage.getItem('cachedFavoritesTimestamp')
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      const maxAge = 30 * 60 * 1000 // 30 minutes
      
      if (age < maxAge) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    console.warn("Failed to get cached favorites:", error)
  }
  
  return null
}

// Display favorites - Enhanced
function displayFavorites() {
  const favoritesGrid = document.getElementById("favoritesGrid")
  const emptyState = document.getElementById("emptyState")
  const favoritesCount = document.getElementById("favoritesCount")

  if (!favoritesGrid) {
    console.error("Favorites grid element not found")
    return
  }

  if (favorites.length === 0) {
    favoritesGrid.style.display = "none"
    if (emptyState) emptyState.style.display = "block"
    if (favoritesCount) favoritesCount.textContent = "0 vehicles"
    return
  }

  favoritesGrid.style.display = "grid"
  if (emptyState) emptyState.style.display = "none"
  if (favoritesCount) {
    favoritesCount.textContent = `${favorites.length} vehicle${favorites.length !== 1 ? "s" : ""}`
  }

  favoritesGrid.innerHTML = favorites.map((vehicle) => createFavoriteCard(vehicle)).join("")
}

// Create favorite card HTML - Enhanced for API data
function createFavoriteCard(vehicle) {
  // Handle different data formats from API
  const make = vehicle.make || "Unknown"
  const model = vehicle.model || "Model"
  const year = vehicle.year || new Date().getFullYear()
  const price = formatPrice(vehicle)
  const range = formatRange(vehicle)
  const efficiency = formatEfficiency(vehicle)
  const acceleration = formatAcceleration(vehicle)
  const topSpeed = formatTopSpeed(vehicle)
  const imageUrl = vehicle.image || vehicle.imageUrl || `/placeholder.svg?height=200&width=350&text=${encodeURIComponent(make + " " + model)}`
  const fullName = vehicle.fullName || `${make} ${model}`

  return `
    <div class="favorite-card">
      <div class="favorite-image">
        <img src="${imageUrl}" alt="${fullName}" 
             onerror="this.src='/placeholder.svg?height=200&width=350&text=${encodeURIComponent(fullName)}'">
        <button class="remove-favorite" onclick="removeFavorite('${vehicle.id}')" title="Remove from favorites">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="favorite-content">
        <div class="favorite-name">${fullName} ${year}</div>
        <div class="favorite-price">${price}</div>
        <div class="favorite-specs">
          <div class="spec-item">
            <i class="fas fa-road spec-icon"></i>
            <span>${range}</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-leaf spec-icon"></i>
            <span>${efficiency}</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-tachometer-alt spec-icon"></i>
            <span>${acceleration}</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-speedometer spec-icon"></i>
            <span>${topSpeed}</span>
          </div>
        </div>
        <div class="favorite-actions">
          <button class="btn-primary" onclick="viewDetails('${vehicle.id}')">View Details</button>
          <button class="btn-secondary" onclick="addToComparison('${vehicle.id}')">Compare</button>
        </div>
      </div>
    </div>
  `
}

// Format functions for different data structures
function formatPrice(vehicle) {
  if (vehicle.priceMin && vehicle.priceMax) {
    return `₹${vehicle.priceMin}L - ₹${vehicle.priceMax}L`
  } else if (vehicle.price) {
    return `$${vehicle.price.toLocaleString()}`
  }
  return "Price on request"
}

function formatRange(vehicle) {
  if (vehicle.maxRange) {
    return `${vehicle.maxRange} km range`
  } else if (vehicle.range) {
    return `${vehicle.range} mi range`
  }
  return "Range N/A"
}

function formatEfficiency(vehicle) {
  if (vehicle.efficiency) {
    return `${vehicle.efficiency} MPGe`
  } else if (vehicle.batteryOptions && vehicle.batteryOptions.length > 0) {
    const maxBattery = Math.max(...vehicle.batteryOptions.map(b => b.capacity))
    return `${maxBattery} kWh`
  }
  return "Efficiency N/A"
}

function formatAcceleration(vehicle) {
  if (vehicle.acceleration) {
    return `0-60: ${vehicle.acceleration}s`
  } else if (vehicle.accelerationTime) {
    return `0-100: ${vehicle.accelerationTime}s`
  }
  return "Acceleration N/A"
}

function formatTopSpeed(vehicle) {
  if (vehicle.topSpeed) {
    const unit = vehicle.topSpeed > 200 ? 'km/h' : 'mph'
    return `Top: ${vehicle.topSpeed} ${unit}`
  }
  return "Top speed N/A"
}

// Remove from favorites - API integrated
async function removeFavorite(vehicleId) {
  if (!confirm("Are you sure you want to remove this vehicle from your favorites?")) {
    return
  }

  try {
    // Show loading state for the specific card
    const card = document.querySelector(`[onclick="removeFavorite('${vehicleId}')"]`)
    if (card) {
      card.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'
      card.disabled = true
    }

    const response = await apiRequest(`/users/favorites/${vehicleId}`, {
      method: 'DELETE'
    })

    if (response.success) {
      // Remove from local array
      favorites = favorites.filter((vehicle) => vehicle.id !== vehicleId)
      
      // Update cache
      cacheFavorites(favorites)
      
      // Refresh display
      displayFavorites()
      
      showSuccessMessage("Vehicle removed from favorites!")
      
      // Track activity
      await trackActivity('unfavorite', vehicleId)
    } else {
      throw new Error(response.message || 'Failed to remove from favorites')
    }
  } catch (error) {
    console.error("Remove favorite error:", error)
    showErrorMessage("Failed to remove from favorites. Please try again.")
    
    // Reset button state
    const card = document.querySelector(`[onclick="removeFavorite('${vehicleId}')"]`)
    if (card) {
      card.innerHTML = '<i class="fas fa-times"></i>'
      card.disabled = false
    }
  }
}

// Add to favorites (for use from other pages)
async function addToFavorites(vehicleId) {
  try {
    const response = await apiRequest('/users/favorites', {
      method: 'POST',
      body: JSON.stringify({ vehicleId })
    })

    if (response.success) {
      showSuccessMessage("Vehicle added to favorites!")
      
      // Refresh favorites if on favorites page
      if (window.location.pathname.includes('favorites.html')) {
        await loadFavorites()
      }
      
      // Track activity
      await trackActivity('favorite', vehicleId)
      
      return true
    } else {
      throw new Error(response.message || 'Failed to add to favorites')
    }
  } catch (error) {
    console.error("Add to favorites error:", error)
    showErrorMessage("Failed to add to favorites. Please try again.")
    return false
  }
}

// View vehicle details - API integrated
async function viewDetails(vehicleId) {
  try {
    // Track activity
    await trackActivity('view', vehicleId)
    
    // Navigate to vehicle details page
    window.location.href = `vehicle-details.html?id=${vehicleId}`
  } catch (error) {
    console.error("Error viewing details:", error)
    showErrorMessage("Failed to load vehicle details. Please try again.")
  }
}

// Add to comparison - API integrated
async function addToComparison(vehicleId) {
  try {
    const vehicle = favorites.find((v) => v.id === vehicleId)
    if (!vehicle) {
      showErrorMessage("Vehicle not found!")
      return
    }

    // Get existing comparison list from API
    const compareResponse = await apiRequest('/users/comparison', {
      method: 'GET'
    })

    let compareList = []
    if (compareResponse.success) {
      compareList = compareResponse.data.comparison || []
    }

    // Check if already in comparison
    if (compareList.find(item => item.id === vehicleId)) {
      showErrorMessage(`${vehicle.fullName || vehicle.make + ' ' + vehicle.model} is already in your comparison list!`)
      return
    }

    // Check if comparison list is full
    if (compareList.length >= 3) {
      showErrorMessage("You can compare maximum 3 vehicles. Please remove one to add another.")
      return
    }

    // Add to comparison via API
    const addResponse = await apiRequest('/users/comparison', {
      method: 'POST',
      body: JSON.stringify({ vehicleId })
    })

    if (addResponse.success) {
      showSuccessMessage(`${vehicle.fullName || vehicle.make + ' ' + vehicle.model} added to comparison! (${compareList.length + 1}/3)`)
      
      // Track activity
      await trackActivity('compare', vehicleId)
    } else {
      throw new Error(addResponse.message || 'Failed to add to comparison')
    }
  } catch (error) {
    console.error("Add to comparison error:", error)
    showErrorMessage("Failed to add to comparison. Please try again.")
  }
}

// Track user activity - API integrated
async function trackActivity(type, itemId) {
  try {
    await apiRequest('/users/activity', {
      method: 'POST',
      body: JSON.stringify({
        type,
        itemId,
        timestamp: new Date().toISOString()
      })
    })
  } catch (error) {
    console.error("Failed to track activity:", error)
    // Don't throw error as this is not critical
  }
}

// Navigation functions
function goToDashboard() {
  window.location.href = "dashboard.html"
}

function goToBrowse() {
  window.location.href = "browse.html"
}

// Clear authentication data
function clearAuthData() {
  localStorage.removeItem("authToken")
  sessionStorage.removeItem("authToken")
  localStorage.removeItem("user")
  sessionStorage.removeItem("user")
  
  // Clear cached data
  localStorage.removeItem("cachedFavorites")
}

// Loading states
function showLoadingState() {
  const container = document.querySelector('.favorites-container') || document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'favoritesLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">Loading your favorites...</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('favoritesLoadingState')
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
  
  .favorite-card {
    transition: transform 0.2s ease-out;
  }
  
  .favorite-card:hover {
    transform: translateY(-2px);
  }
`
document.head.appendChild(style)

// Export functions for use in other files
window.favoritesSystem = {
  loadFavorites,
  addToFavorites,
  removeFavorite,
  getFavorites: () => favorites
}

console.log("Favorites.js loaded successfully with API integration")
