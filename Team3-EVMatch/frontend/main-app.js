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

// Remove hardcoded data - will be fetched from API
// const evData = [...] // REMOVED
// const chargingStations = [...] // REMOVED

// Global variables
let currentPage = 1
let filteredEVs = []
let comparisonList = []
let evData = [] // Will be populated from API
let chargingStations = [] // Will be populated from API

// Load EV data from API
async function loadEVData() {
  try {
    // Check if data is already loaded
    if (evData.length > 0) {
      return evData
    }

    // Check for cached data first
    const cachedData = localStorage.getItem('cachedEVData')
    const cacheTimestamp = localStorage.getItem('cachedEVDataTimestamp')
    
    if (cachedData && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp)
      const maxAge = 60 * 60 * 1000 // 1 hour
      
      if (cacheAge < maxAge) {
        console.log("Using cached EV data")
        evData = JSON.parse(cachedData)
        filteredEVs = [...evData]
        return evData
      }
    }

    // Fetch from API
    console.log("Fetching EV data from API...")
    const response = await apiRequest('/vehicles', {
      method: 'GET'
    })

    if (response.success) {
      evData = response.data.vehicles || []
      filteredEVs = [...evData]
      
      // Cache the data
      localStorage.setItem('cachedEVData', JSON.stringify(evData))
      localStorage.setItem('cachedEVDataTimestamp', Date.now().toString())
      
      console.log(`Loaded ${evData.length} vehicles from API`)
      return evData
    } else {
      throw new Error(response.message || 'Failed to fetch vehicles')
    }
  } catch (error) {
    console.error("Error loading EV data:", error)
    
    // Fallback to cached data if available
    const cachedData = localStorage.getItem('cachedEVData')
    if (cachedData) {
      console.log("Using cached EV data as fallback")
      evData = JSON.parse(cachedData)
      filteredEVs = [...evData]
      return evData
    }
    
    // If no cached data, return empty array
    evData = []
    filteredEVs = []
    throw error
  }
}

// Load charging stations from API
async function loadChargingStations() {
  try {
    // Check for cached data first
    const cachedStations = localStorage.getItem('cachedChargingStations')
    const cacheTimestamp = localStorage.getItem('cachedChargingTimestamp')
    
    if (cachedStations && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp)
      const maxAge = 30 * 60 * 1000 // 30 minutes (more frequent updates for real-time data)
      
      if (cacheAge < maxAge) {
        console.log("Using cached charging stations")
        chargingStations = JSON.parse(cachedStations)
        return chargingStations
      }
    }

    // Fetch from API
    console.log("Fetching charging stations from API...")
    const response = await apiRequest('/charging-stations', {
      method: 'GET'
    })

    if (response.success) {
      chargingStations = response.data.stations || []
      
      // Cache the data
      localStorage.setItem('cachedChargingStations', JSON.stringify(chargingStations))
      localStorage.setItem('cachedChargingTimestamp', Date.now().toString())
      
      console.log(`Loaded ${chargingStations.length} charging stations from API`)
      return chargingStations
    } else {
      throw new Error(response.message || 'Failed to fetch charging stations')
    }
  } catch (error) {
    console.error("Error loading charging stations:", error)
    
    // Fallback to cached data if available
    const cachedStations = localStorage.getItem('cachedChargingStations')
    if (cachedStations) {
      console.log("Using cached charging stations as fallback")
      chargingStations = JSON.parse(cachedStations)
      return chargingStations
    }
    
    // If no cached data, return empty array
    chargingStations = []
    return []
  }
}

// Initialize app - API integrated
document.addEventListener('DOMContentLoaded', async () => {
  const currentPath = window.location.pathname

  try {
    // Show loading state
    showLoadingState()

    // Load data based on current page
    if (currentPath.includes('dashboard.html') || currentPath === '/') {
      await loadEVData()
      await loadPopularEVs()
    } else if (currentPath.includes('charging.html')) {
      await loadChargingStations()
      await displayChargingStations()
    }

    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize app:", error)
    hideLoadingState()
    showErrorMessage("Failed to load data. Please check your connection and try again.")
  }
})

// Load popular EVs for dashboard - API integrated
async function loadPopularEVs() {
  const container = document.getElementById('popularEVs')
  if (!container) return

  try {
    // Show loading state in container
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Loading popular EVs...</p>
      </div>
    `

    // Try to get popular EVs from API first
    let popularEVs = []
    
    try {
      const response = await apiRequest('/vehicles/popular?limit=4', {
        method: 'GET'
      })

      if (response.success && response.data.vehicles) {
        popularEVs = response.data.vehicles
      } else {
        throw new Error('No popular vehicles from API')
      }
    } catch (apiError) {
      console.log("Popular EVs API failed, using first 4 from general data")
      
      // Ensure EV data is loaded
      await loadEVData()
      popularEVs = evData.slice(0, 4)
    }

    if (popularEVs.length > 0) {
      container.innerHTML = popularEVs.map(ev => createEVCard(ev)).join('')
    } else {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #6b7280;">
          <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>No EVs available at the moment. Please try again later.</p>
        </div>
      `
    }
  } catch (error) {
    console.error("Error loading popular EVs:", error)
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #dc2626;">
        <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to load popular EVs. Please try again later.</p>
        <button onclick="loadPopularEVs()" class="btn btn-primary" style="margin-top: 1rem;">
          Retry
        </button>
      </div>
    `
  }
}

// Create EV card HTML - Enhanced for API data
function createEVCard(ev) {
  // Handle different data formats from API
  const make = ev.make || "Unknown"
  const model = ev.model || "Model"
  const year = ev.year || new Date().getFullYear()
  const price = formatPrice(ev)
  const range = formatRange(ev)
  const efficiency = formatEfficiency(ev)
  const acceleration = ev.acceleration || ev.accelerationTime || "N/A"
  const seating = ev.seating || ev.seats || "N/A"
  const imageUrl = ev.image || ev.imageUrl || `/placeholder.svg?height=200&width=320&text=${encodeURIComponent(make + " " + model)}`

  return `
    <div class="ev-card" onclick="viewEVDetails('${ev.id}')">
      <div class="ev-image">
        <img src="${imageUrl}" alt="${make} ${model}" onerror="this.src='/placeholder.svg?height=200&width=320&text=${encodeURIComponent(make + ' ' + model)}'">
      </div>
      <div class="ev-content">
        <div class="ev-header">
          <div>
            <div class="ev-title">${make} ${model}</div>
            <div class="ev-make">${year}</div>
          </div>
          <div class="ev-price">${price}</div>
        </div>
        <div class="ev-specs">
          <div class="spec-item">
            <i class="fas fa-road"></i>
            <span>${range}</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-bolt"></i>
            <span>${efficiency}</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-tachometer-alt"></i>
            <span>0-60: ${acceleration}s</span>
          </div>
          <div class="spec-item">
            <i class="fas fa-users"></i>
            <span>${seating} seats</span>
          </div>
        </div>
        <div class="ev-actions">
          <button class="btn-small btn-compare" onclick="event.stopPropagation(); addToComparison('${ev.id}')">
            <i class="fas fa-balance-scale"></i>
            Compare
          </button>
          <button class="btn-small btn-details">
            <i class="fas fa-info-circle"></i>
            Details
          </button>
        </div>
      </div>
    </div>
  `
}

// Format functions for different data structures
function formatPrice(ev) {
  if (ev.priceMin && ev.priceMax) {
    return `₹${ev.priceMin}L - ₹${ev.priceMax}L`
  } else if (ev.price) {
    return formatCurrency(ev.price)
  }
  return "Price on request"
}

function formatRange(ev) {
  if (ev.maxRange) {
    return `${ev.maxRange} km`
  } else if (ev.range) {
    return `${ev.range} miles`
  }
  return "Range N/A"
}

function formatEfficiency(ev) {
  if (ev.efficiency) {
    return `${ev.efficiency} MPGe`
  } else if (ev.batteryOptions && ev.batteryOptions.length > 0) {
    const maxBattery = Math.max(...ev.batteryOptions.map(b => b.capacity))
    return `${maxBattery} kWh`
  }
  return "Efficiency N/A"
}

// View EV details - API integrated
async function viewEVDetails(evId) {
  try {
    // Track activity
    await trackActivity("view", evId)
    
    // Get detailed vehicle info from API
    const response = await apiRequest(`/vehicles/${evId}`, {
      method: 'GET'
    })

    if (response.success) {
      const ev = response.data.vehicle
      showEVDetailsModal(ev)
    } else {
      // Fallback to local data
      const ev = evData.find(e => e.id === evId)
      if (ev) {
        showEVDetailsModal(ev)
      } else {
        showErrorMessage("Vehicle details not found.")
      }
    }
  } catch (error) {
    console.error("Error viewing EV details:", error)
    
    // Fallback to local data
    const ev = evData.find(e => e.id === evId)
    if (ev) {
      showEVDetailsModal(ev)
    } else {
      showErrorMessage("Failed to load vehicle details. Please try again.")
    }
  }
}

// Show EV details modal
function showEVDetailsModal(ev) {
  const make = ev.make || "Unknown"
  const model = ev.model || "Model"
  const price = formatPrice(ev)
  const range = formatRange(ev)
  const efficiency = formatEfficiency(ev)
  const acceleration = ev.acceleration || ev.accelerationTime || "N/A"
  const topSpeed = ev.topSpeed ? `${ev.topSpeed} mph` : "N/A"
  const seating = ev.seating || ev.seats || "N/A"
  const chargingSpeed = ev.chargingSpeed || "N/A"

  const modal = document.createElement('div')
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; overflow-y: auto;">
      <div style="background: white; max-width: 600px; width: 90%; margin: 2rem; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem;">
          <h2 style="margin: 0; font-size: 1.5rem;">${make} ${model} Details</h2>
        </div>
        
        <div style="padding: 1.5rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #059669;">${price}</div>
              <div style="color: #6b7280;">Price</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${range}</div>
              <div style="color: #6b7280;">Range</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #7c3aed;">${efficiency}</div>
              <div style="color: #6b7280;">Efficiency</div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div><strong>Acceleration:</strong> 0-60 in ${acceleration}s</div>
            <div><strong>Top Speed:</strong> ${topSpeed}</div>
            <div><strong>Seating:</strong> ${seating} people</div>
            <div><strong>Charging Speed:</strong> ${chargingSpeed}</div>
          </div>
          
          <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button onclick="addToFavorites('${ev.id}')" class="btn btn-secondary" style="flex: 1;">
              ❤️ Add to Favorites
            </button>
            <button onclick="addToComparison('${ev.id}')" class="btn btn-primary" style="flex: 1;">
              📊 Compare
            </button>
          </div>
        </div>
        
        <div style="padding: 1rem 1.5rem; background: #f8fafc; border-top: 1px solid #e5e7eb;">
          <button onclick="this.closest('div').parentElement.remove()" style="width: 100%; padding: 0.75rem; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">
            Close
          </button>
        </div>
      </div>
    </div>
  `
  
  document.body.appendChild(modal)
}

// Add to comparison - API integrated
async function addToComparison(evId) {
  try {
    if (comparisonList.includes(evId)) {
      showErrorMessage('This vehicle is already in your comparison list.')
      return
    }

    if (comparisonList.length >= 3) {
      showErrorMessage('You can compare up to 3 vehicles at once.')
      return
    }

    // Add to API comparison
    const response = await apiRequest('/users/comparison', {
      method: 'POST',
      body: JSON.stringify({ vehicleId: evId })
    })

    if (response.success) {
      comparisonList.push(evId)
      updateComparisonBadge()

      const ev = evData.find(e => e.id === evId) || { make: "Unknown", model: "Vehicle" }
      showSuccessMessage(`${ev.make} ${ev.model} added to comparison!`)
      
      // Track activity
      await trackActivity('compare', evId)
    } else {
      throw new Error(response.message || 'Failed to add to comparison')
    }
  } catch (error) {
    console.error("Add to comparison error:", error)
    
    // Fallback to local comparison
    comparisonList.push(evId)
    updateComparisonBadge()

    const ev = evData.find(e => e.id === evId) || { make: "Unknown", model: "Vehicle" }
    showSuccessMessage(`${ev.make} ${ev.model} added to comparison!`)
  }
}

// Add to favorites - API integrated
async function addToFavorites(evId) {
  try {
    const response = await apiRequest('/users/favorites', {
      method: 'POST',
      body: JSON.stringify({ vehicleId: evId })
    })

    if (response.success) {
      const ev = evData.find(e => e.id === evId) || { make: "Unknown", model: "Vehicle" }
      showSuccessMessage(`${ev.make} ${ev.model} added to favorites!`)
      
      // Track activity
      await trackActivity('favorite', evId)
    } else {
      throw new Error(response.message || 'Failed to add to favorites')
    }
  } catch (error) {
    console.error("Add to favorites error:", error)
    showErrorMessage("Failed to add to favorites. Please try again.")
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

// Update comparison badge
function updateComparisonBadge() {
  const badge = document.querySelector('.comparison-badge')
  if (badge) {
    badge.textContent = comparisonList.length
    badge.style.display = comparisonList.length > 0 ? 'block' : 'none'
  }
  console.log(`Comparison list: ${comparisonList.length} vehicles`)
}

// Display charging stations - API integrated
async function displayChargingStations() {
  const container = document.getElementById('chargingStationsGrid')
  if (!container) return

  try {
    await loadChargingStations()
    
    if (chargingStations.length > 0) {
      container.innerHTML = chargingStations.map(station => createChargingStationCard(station)).join('')
    } else {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #6b7280;">
          <i class="fas fa-charging-station" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>No charging stations found in your area.</p>
        </div>
      `
    }
  } catch (error) {
    console.error("Error displaying charging stations:", error)
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #dc2626;">
        <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to load charging stations. Please try again.</p>
        <button onclick="displayChargingStations()" class="btn btn-primary">
          Retry
        </button>
      </div>
    `
  }
}

// Create charging station card
function createChargingStationCard(station) {
  const statusColor = station.status === 'available' ? '#10b981' : '#dc2626'
  
  return `
    <div class="charging-card">
      <div class="charging-header">
        <div class="charging-name">${station.name}</div>
        <div class="charging-status" style="color: ${statusColor};">
          ${station.status === 'available' ? '● Available' : '● Occupied'}
        </div>
      </div>
      <div class="charging-details">
        <div class="charging-address">${station.address}</div>
        <div class="charging-specs">
          <span>${station.type} - ${station.power}</span>
          <span>${station.available}/${station.total} available</span>
          <span>${station.price}</span>
          <span>${station.distance}</span>
        </div>
        <div class="charging-network">${station.network}</div>
      </div>
    </div>
  `
}

// Loading states
function showLoadingState() {
  const container = document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'globalLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">Loading...</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('globalLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
}

// Utility functions (kept the same)
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function formatNumber(num) {
  return num.toLocaleString()
}

// Message functions - Enhanced
function showSuccessMessage(message) {
  const successDiv = document.createElement('div')
  successDiv.className = 'success-message'
  successDiv.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `
  successDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #c6f6d5;
    color: #276749;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideInRight 0.3s ease-out;
  `

  document.body.appendChild(successDiv)

  setTimeout(() => {
    successDiv.style.animation = 'slideOutRight 0.3s ease-out'
    setTimeout(() => successDiv.remove(), 300)
  }, 3000)
}

function showErrorMessage(message) {
  const errorDiv = document.createElement('div')
  errorDiv.className = 'error-message'
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #fed7d7;
    color: #c53030;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideInRight 0.3s ease-out;
  `

  document.body.appendChild(errorDiv)

  setTimeout(() => {
    errorDiv.style.animation = 'slideOutRight 0.3s ease-out'
    setTimeout(() => errorDiv.remove(), 300)
  }, 3000)
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
window.evSystem = {
  loadEVData,
  loadChargingStations,
  addToComparison,
  addToFavorites,
  trackActivity,
  getEVData: () => evData,
  getChargingStations: () => chargingStations
}

console.log("EV System loaded successfully with API integration")
