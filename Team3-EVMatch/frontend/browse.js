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

// Remove hardcoded database - will be fetched from API
// const completeEVDatabase = [...] // REMOVED

// Global state
let completeEVDatabase = [] // Will be populated from API
let currentFilters = {
  search: "",
  maxPrice: 35,
  makes: [],
  bodyTypes: [],
  minRange: 150,
  batteryTypes: [],
}

let currentSort = "name"
let filteredEVs = []

// Initialize page when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing browse page...")
  
  try {
    // Show loading state
    showLoadingState()
    
    // Fetch EV data from API
    await fetchEVDatabase()
    
    // Initialize page after data is loaded
    initializeBrowsePage()
    setupEventListeners()
    
    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize page:", error)
    showErrorState()
  }
})

// Fetch EV database from API
async function fetchEVDatabase() {
  try {
    console.log("Fetching EV database from API...")
    
    const response = await apiRequest('/vehicles', {
      method: 'GET'
    })
    
    if (response.success) {
      completeEVDatabase = response.data.vehicles || []
      console.log(`Loaded ${completeEVDatabase.length} vehicles from API`)
    } else {
      throw new Error(response.message || 'Failed to fetch vehicles')
    }
  } catch (error) {
    console.error("Error fetching EV database:", error)
    
    // Fallback to cached data if available
    const cachedData = localStorage.getItem('cachedEVDatabase')
    if (cachedData) {
      console.log("Using cached EV database")
      completeEVDatabase = JSON.parse(cachedData)
    } else {
      throw new Error("No EV data available")
    }
  }
}

// Cache EV data for offline use
function cacheEVDatabase() {
  try {
    localStorage.setItem('cachedEVDatabase', JSON.stringify(completeEVDatabase))
    localStorage.setItem('cachedEVDatabaseTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache EV database:", error)
  }
}

// Check if cached data is still valid (24 hours)
function isCachedDataValid() {
  const timestamp = localStorage.getItem('cachedEVDatabaseTimestamp')
  if (!timestamp) return false
  
  const cacheAge = Date.now() - parseInt(timestamp)
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  
  return cacheAge < maxAge
}

// Fetch filter options from API
async function fetchFilterOptions() {
  try {
    const response = await apiRequest('/vehicles/filters', {
      method: 'GET'
    })
    
    if (response.success) {
      const { makes, bodyTypes, batteryTypes, priceRange, rangeValues } = response.data
      
      // Update filter UI with API data
      updateFilterUI(makes, bodyTypes, batteryTypes, priceRange, rangeValues)
    }
  } catch (error) {
    console.error("Error fetching filter options:", error)
    // Extract filter options from loaded data as fallback
    extractFilterOptionsFromData()
  }
}

// Extract filter options from loaded data (fallback)
function extractFilterOptionsFromData() {
  if (completeEVDatabase.length === 0) return
  
  const makes = [...new Set(completeEVDatabase.map(ev => ev.make))].sort()
  const bodyTypes = [...new Set(completeEVDatabase.map(ev => ev.bodyType))].sort()
  const maxPrice = Math.max(...completeEVDatabase.map(ev => ev.priceMax))
  const maxRange = Math.max(...completeEVDatabase.map(ev => ev.maxRange))
  
  updateFilterUI(makes, bodyTypes, ['small', 'medium', 'large'], { min: 0, max: maxPrice }, { min: 0, max: maxRange })
}

// Update filter UI with dynamic options
function updateFilterUI(makes, bodyTypes, batteryTypes, priceRange, rangeValues) {
  // Update make filters
  updateCheckboxFilters('makeFilters', makes)
  
  // Update body type filters
  updateCheckboxFilters('bodyTypeFilters', bodyTypes)
  
  // Update battery type filters
  updateCheckboxFilters('batteryFilters', batteryTypes.map(type => ({
    value: type,
    label: type === 'small' ? 'Small (< 5 kWh)' : 
           type === 'medium' ? 'Medium (5-15 kWh)' : 
           'Large (> 15 kWh)'
  })))
  
  // Update price range slider
  const priceSlider = document.getElementById("priceRange")
  if (priceSlider && priceRange) {
    priceSlider.max = priceRange.max
    priceSlider.value = Math.min(currentFilters.maxPrice, priceRange.max)
    currentFilters.maxPrice = parseInt(priceSlider.value)
  }
  
  // Update range slider
  const rangeSlider = document.getElementById("rangeFilter")
  if (rangeSlider && rangeValues) {
    rangeSlider.max = rangeValues.max
    rangeSlider.value = Math.max(currentFilters.minRange, rangeValues.min)
    currentFilters.minRange = parseInt(rangeSlider.value)
  }
}

// Update checkbox filters dynamically
function updateCheckboxFilters(containerId, options) {
  const container = document.getElementById(containerId)
  if (!container) return
  
  const optionsArray = Array.isArray(options) ? options : []
  
  container.innerHTML = optionsArray.map(option => {
    const value = typeof option === 'string' ? option : option.value
    const label = typeof option === 'string' ? option : option.label
    
    return `
      <div class="checkbox-item">
        <input type="checkbox" id="${containerId}_${value}" value="${value}">
        <label for="${containerId}_${value}">${label}</label>
      </div>
    `
  }).join('')
}

// Search vehicles with API (for advanced search)
async function searchVehicles(searchParams) {
  try {
    const queryString = new URLSearchParams(searchParams).toString()
    const response = await apiRequest(`/vehicles/search?${queryString}`, {
      method: 'GET'
    })
    
    if (response.success) {
      return response.data.vehicles || []
    }
    
    throw new Error(response.message || 'Search failed')
  } catch (error) {
    console.error("Error searching vehicles:", error)
    // Fallback to local filtering
    return filterVehiclesLocally(searchParams)
  }
}

// Fallback local filtering
function filterVehiclesLocally(searchParams) {
  return completeEVDatabase.filter(ev => {
    // Apply search filters locally
    if (searchParams.search) {
      const searchTerm = searchParams.search.toLowerCase()
      const matches = ev.make.toLowerCase().includes(searchTerm) ||
                     ev.model.toLowerCase().includes(searchTerm) ||
                     ev.fullName.toLowerCase().includes(searchTerm)
      if (!matches) return false
    }
    
    if (searchParams.maxPrice && ev.priceMin > searchParams.maxPrice) return false
    if (searchParams.minRange && ev.maxRange < searchParams.minRange) return false
    if (searchParams.makes && searchParams.makes.length > 0 && !searchParams.makes.includes(ev.make)) return false
    if (searchParams.bodyTypes && searchParams.bodyTypes.length > 0 && !searchParams.bodyTypes.includes(ev.bodyType)) return false
    
    return true
  })
}

// Get vehicle details from API
async function getVehicleDetails(vehicleId) {
  try {
    const response = await apiRequest(`/vehicles/${vehicleId}`, {
      method: 'GET'
    })
    
    if (response.success) {
      return response.data.vehicle
    }
    
    throw new Error(response.message || 'Vehicle not found')
  } catch (error) {
    console.error("Error fetching vehicle details:", error)
    
    // Fallback to local data
    return completeEVDatabase.find(ev => ev.id === vehicleId) || null
  }
}

// Save vehicle to favorites via API
async function saveToFavorites(vehicleId) {
  try {
    const response = await apiRequest('/user/favorites', {
      method: 'POST',
      body: JSON.stringify({ vehicleId })
    })
    
    if (response.success) {
      return true
    }
    
    throw new Error(response.message || 'Failed to save favorite')
  } catch (error) {
    console.error("Error saving to favorites:", error)
    
    // Fallback to local storage
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]')
    if (!favorites.includes(vehicleId)) {
      favorites.push(vehicleId)
      localStorage.setItem('favorites', JSON.stringify(favorites))
    }
    
    return true
  }
}

// Get user favorites from API
async function getUserFavorites() {
  try {
    const response = await apiRequest('/user/favorites', {
      method: 'GET'
    })
    
    if (response.success) {
      return response.data.favorites || []
    }
    
    throw new Error(response.message || 'Failed to fetch favorites')
  } catch (error) {
    console.error("Error fetching favorites:", error)
    
    // Fallback to local storage
    return JSON.parse(localStorage.getItem('favorites') || '[]')
  }
}

// Save comparison list to API
async function saveComparisonList(vehicleIds) {
  try {
    const response = await apiRequest('/user/comparison', {
      method: 'POST',
      body: JSON.stringify({ vehicleIds })
    })
    
    if (response.success) {
      return true
    }
    
    throw new Error(response.message || 'Failed to save comparison')
  } catch (error) {
    console.error("Error saving comparison list:", error)
    
    // Fallback to local storage
    localStorage.setItem('compareList', JSON.stringify(vehicleIds))
    return true
  }
}

// Initialize page with API data
async function initializeBrowsePage() {
  console.log("Setting up initial filters and display...")
  
  try {
    // Fetch and setup filter options
    await fetchFilterOptions()
    
    // Cache the data
    cacheEVDatabase()
    
    // Apply initial filters
    await applyFiltersWithAPI()
    updateResultsCount()
    displayResults()
  } catch (error) {
    console.error("Error initializing browse page:", error)
    showErrorState()
  }
}

// Apply filters with API support
async function applyFiltersWithAPI() {
  console.log("Applying filters:", currentFilters)
  
  try {
    // For simple filters, use API search
    if (shouldUseAPISearch()) {
      const searchParams = {
        search: currentFilters.search,
        maxPrice: currentFilters.maxPrice,
        minRange: currentFilters.minRange,
        makes: currentFilters.makes,
        bodyTypes: currentFilters.bodyTypes,
        batteryTypes: currentFilters.batteryTypes
      }
      
      filteredEVs = await searchVehicles(searchParams)
    } else {
      // Use local filtering for complex scenarios
      filteredEVs = filterVehiclesLocally(currentFilters)
    }
    
    console.log(`Filtered results: ${filteredEVs.length} vehicles`)
    applySort()
    updateResultsCount()
    displayResults()
  } catch (error) {
    console.error("Error applying filters:", error)
    // Fallback to local filtering
    applyFiltersLocal()
  }
}

// Determine if should use API search vs local filtering
function shouldUseAPISearch() {
  // Use API for simple searches, local for complex filtering
  const hasComplexFilters = currentFilters.batteryTypes.length > 0
  return !hasComplexFilters
}

// Fallback to original local filtering
function applyFiltersLocal() {
  console.log("Using local filtering fallback")
  
  filteredEVs = completeEVDatabase.filter((ev) => {
    // Search filter
    if (currentFilters.search) {
      const searchTerm = currentFilters.search.toLowerCase()
      const matchesSearch =
        ev.make.toLowerCase().includes(searchTerm) ||
        ev.model.toLowerCase().includes(searchTerm) ||
        ev.fullName.toLowerCase().includes(searchTerm) ||
        ev.features.some((feature) => feature.toLowerCase().includes(searchTerm))

      if (!matchesSearch) return false
    }

    // Price filter
    if (ev.priceMin > currentFilters.maxPrice) return false

    // Make filter
    if (currentFilters.makes.length > 0 && !currentFilters.makes.includes(ev.make)) return false

    // Body type filter
    if (currentFilters.bodyTypes.length > 0 && !currentFilters.bodyTypes.includes(ev.bodyType)) return false

    // Range filter
    if (ev.maxRange < currentFilters.minRange) return false

    // Battery capacity filter
    if (currentFilters.batteryTypes.length > 0) {
      const maxBatteryCapacity = Math.max(...ev.batteryOptions.map((b) => b.capacity))
      let matchesBattery = false

      currentFilters.batteryTypes.forEach((type) => {
        if (type === "small" && maxBatteryCapacity < 5) matchesBattery = true
        if (type === "medium" && maxBatteryCapacity >= 5 && maxBatteryCapacity <= 15) matchesBattery = true
        if (type === "large" && maxBatteryCapacity > 15) matchesBattery = true
      })

      if (!matchesBattery) return false
    }

    return true
  })

  applySort()
  updateResultsCount()
  displayResults()
}

// Updated applyFilters function to use API
function applyFilters() {
  applyFiltersWithAPI()
}

// Enhanced view details with API
async function viewDetails(evId) {
  try {
    showLoadingModal()
    const ev = await getVehicleDetails(evId)
    hideLoadingModal()
    
    if (ev) {
      // Store selected EV for details page
      localStorage.setItem("selectedEV", JSON.stringify(ev))
      
      // Show detailed modal or navigate to details page
      showVehicleDetailsModal(ev)
    } else {
      alert("Vehicle details not found")
    }
  } catch (error) {
    hideLoadingModal()
    console.error("Error viewing details:", error)
    alert("Failed to load vehicle details. Please try again.")
  }
}

// Enhanced add to compare with API
async function addToCompare(evId) {
  try {
    const ev = await getVehicleDetails(evId)
    if (!ev) {
      alert("Vehicle not found")
      return
    }
    
    // Get existing comparison list
    const compareList = JSON.parse(localStorage.getItem("compareList") || "[]")
    
    // Check if already in comparison
    if (compareList.find((item) => item.id === evId)) {
      alert(`${ev.fullName} is already in your comparison list!`)
      return
    }
    
    // Check if comparison list is full
    if (compareList.length >= 3) {
      alert("You can compare maximum 3 vehicles. Please remove one to add another.")
      return
    }
    
    // Add to comparison
    compareList.push(ev)
    
    // Save to API and local storage
    await saveComparisonList(compareList)
    localStorage.setItem("compareList", JSON.stringify(compareList))
    
    alert(`${ev.fullName} added to comparison! (${compareList.length}/3)`)
  } catch (error) {
    console.error("Error adding to compare:", error)
    alert("Failed to add vehicle to comparison. Please try again.")
  }
}

// Loading states
function showLoadingState() {
  const resultsGrid = document.getElementById("resultsGrid")
  if (resultsGrid) {
    resultsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Loading vehicles...</p>
      </div>
    `
  }
}

function hideLoadingState() {
  // Loading will be hidden when results are displayed
}

function showErrorState() {
  const resultsGrid = document.getElementById("resultsGrid")
  if (resultsGrid) {
    resultsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <div style="color: #dc2626; font-size: 1.2rem; margin-bottom: 1rem;">
          ⚠️ Failed to load vehicles
        </div>
        <p>Please check your internet connection and try again.</p>
        <button onclick="location.reload()" class="btn btn-primary">
          Retry
        </button>
      </div>
    `
  }
}

function showLoadingModal() {
  // Create and show loading modal
  const modal = document.createElement('div')
  modal.id = 'loadingModal'
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: white; padding: 2rem; border-radius: 8px; text-align: center;">
        <div class="loading-spinner"></div>
        <p>Loading vehicle details...</p>
      </div>
    </div>
  `
  document.body.appendChild(modal)
}

function hideLoadingModal() {
  const modal = document.getElementById('loadingModal')
  if (modal) {
    modal.remove()
  }
}

function showVehicleDetailsModal(ev) {
  const batteryInfo = ev.batteryOptions.map((b) => `${b.capacity} kWh (${b.range} km)`).join(", ")
  
  const modal = document.createElement('div')
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; overflow-y: auto;">
      <div style="background: white; max-width: 600px; width: 90%; margin: 2rem; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem;">
          <h2 style="margin: 0; font-size: 1.5rem;">${ev.fullName}</h2>
          <div style="margin-top: 0.5rem; opacity: 0.9;">₹${ev.priceMin} - ₹${ev.priceMax} Lakh</div>
        </div>
        
        <div style="padding: 1.5rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #059669;">${ev.maxRange} km</div>
              <div style="color: #6b7280;">Max Range</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #dc2626;">${ev.motorPower} PS</div>
              <div style="color: #6b7280;">Power</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px;">
              <div style="font-size: 1.5rem; font-weight: bold; color: #7c3aed;">${ev.seating}</div>
              <div style="color: #6b7280;">Seating</div>
            </div>
          </div>
          
          <div style="margin-bottom: 1rem;">
            <strong>Battery Options:</strong> ${batteryInfo}
          </div>
          <div style="margin-bottom: 1rem;">
            <strong>Key Features:</strong> ${ev.features.join(", ")}
          </div>
          <div style="margin-bottom: 1rem;">
            <strong>Available Variants:</strong> ${ev.variants.join(", ")}
          </div>
          
          <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
            <button onclick="addToFavorites(${ev.id})" class="btn btn-secondary" style="flex: 1;">
              ❤️ Add to Favorites
            </button>
            <button onclick="addToCompare(${ev.id})" class="btn btn-primary" style="flex: 1;">
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

// Add to favorites function
async function addToFavorites(evId) {
  try {
    await saveToFavorites(evId)
    alert("Added to favorites!")
  } catch (error) {
    console.error("Error adding to favorites:", error)
    alert("Failed to add to favorites. Please try again.")
  }
}

// Keep all other existing functions (setupEventListeners, applySort, etc.)
// ... [Rest of the existing functions remain the same]

// Updated setupEventListeners function
function setupEventListeners() {
  console.log("Setting up event listeners...")
  
  // Search input with debouncing
  const searchInput = document.getElementById("searchInput")
  if (searchInput) {
    let searchTimeout
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout)
      searchTimeout = setTimeout(() => {
        currentFilters.search = e.target.value.toLowerCase().trim()
        console.log("Search filter applied:", currentFilters.search)
        applyFilters()
      }, 500) // Increased debounce for API calls
    })
  }

  // Price range slider
  const priceRange = document.getElementById("priceRange")
  if (priceRange) {
    priceRange.addEventListener("input", (e) => {
      currentFilters.maxPrice = parseInt(e.target.value)
      const maxPriceLabel = document.getElementById("maxPrice")
      if (maxPriceLabel) {
        maxPriceLabel.textContent = `₹${currentFilters.maxPrice}L`
      }
      console.log("Price filter applied:", currentFilters.maxPrice)
      applyFilters()
    })
  }

  // Range filter slider
  const rangeFilter = document.getElementById("rangeFilter")
  if (rangeFilter) {
    rangeFilter.addEventListener("input", (e) => {
      currentFilters.minRange = parseInt(e.target.value)
      const maxRangeLabel = document.getElementById("maxRange")
      if (maxRangeLabel) {
        maxRangeLabel.textContent = `${currentFilters.minRange}+ km`
      }
      console.log("Range filter applied:", currentFilters.minRange)
      applyFilters()
    })
  }

  // Make filters
  setupCheckboxFilters("makeFilters", "makes")

  // Body type filters
  setupCheckboxFilters("bodyTypeFilters", "bodyTypes")

  // Battery filters
  setupCheckboxFilters("batteryFilters", "batteryTypes")

  // Sort dropdown
  const sortSelect = document.getElementById("sortSelect")
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value
      console.log("Sort applied:", currentSort)
      applySort()
      displayResults()
    })
  }
}

// Export for use in other files
window.evBrowseSystem = {
  fetchEVDatabase,
  getVehicleDetails,
  saveToFavorites,
  getUserFavorites,
  searchVehicles,
  completeEVDatabase: () => completeEVDatabase
}

// Add CSS for loading spinner
const style = document.createElement("style")
style.textContent = `
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
document.head.appendChild(style)
