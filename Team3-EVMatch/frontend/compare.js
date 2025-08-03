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

// Compare page functionality - API integrated
let selectedVehicles = [null, null, null]
let currentSelectorIndex = 0
let completeEVDatabase = [] // Will be populated from API

// Load EV database from API
async function loadEVDatabase() {
  try {
    // Check if data is already loaded
    if (completeEVDatabase.length > 0) {
      return completeEVDatabase
    }

    // Check for cached data first
    const cachedData = localStorage.getItem('cachedEVDatabase')
    const cacheTimestamp = localStorage.getItem('cachedEVDatabaseTimestamp')
    
    if (cachedData && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      
      if (cacheAge < maxAge) {
        console.log("Using cached EV database")
        completeEVDatabase = JSON.parse(cachedData)
        return completeEVDatabase
      }
    }

    // Fetch from API
    console.log("Fetching EV database from API...")
    const response = await apiRequest('/vehicles', {
      method: 'GET'
    })

    if (response.success) {
      completeEVDatabase = response.data.vehicles || []
      
      // Cache the data
      localStorage.setItem('cachedEVDatabase', JSON.stringify(completeEVDatabase))
      localStorage.setItem('cachedEVDatabaseTimestamp', Date.now().toString())
      
      console.log(`Loaded ${completeEVDatabase.length} vehicles from API`)
      return completeEVDatabase
    } else {
      throw new Error(response.message || 'Failed to fetch vehicles')
    }
  } catch (error) {
    console.error("Error loading EV database:", error)
    
    // Fallback to cached data if available
    const cachedData = localStorage.getItem('cachedEVDatabase')
    if (cachedData) {
      console.log("Using cached EV database as fallback")
      completeEVDatabase = JSON.parse(cachedData)
      return completeEVDatabase
    }
    
    // If no cached data, show error
    showErrorState()
    return []
  }
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

// Save comparison list to API
async function saveComparisonToAPI(vehicleIds) {
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
    console.error("Error saving comparison to API:", error)
    return false
  }
}

// Get user's comparison list from API
async function getUserComparison() {
  try {
    const response = await apiRequest('/user/comparison', {
      method: 'GET'
    })
    
    if (response.success) {
      return response.data.comparison || []
    }
    
    throw new Error(response.message || 'Failed to fetch comparison')
  } catch (error) {
    console.error("Error fetching user comparison:", error)
    
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem("compareList") || "[]")
  }
}

// Search vehicles for comparison
async function searchVehiclesForComparison(searchTerm) {
  try {
    const response = await apiRequest(`/vehicles/search?q=${encodeURIComponent(searchTerm)}&limit=20`, {
      method: 'GET'
    })
    
    if (response.success) {
      return response.data.vehicles || []
    }
    
    throw new Error(response.message || 'Search failed')
  } catch (error) {
    console.error("Error searching vehicles:", error)
    
    // Fallback to local filtering
    return completeEVDatabase.filter(ev => 
      ev.status !== "Coming Soon" &&
      (ev.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
       ev.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
       ev.fullName.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }
}

function formatCurrency(value) {
  return `₹${value} Lakh`
}

// Initialize compare page - API integrated
document.addEventListener("DOMContentLoaded", async () => {
  if (window.location.pathname.includes("compare.html")) {
    console.log("Initializing compare page...")
    
    try {
      // Show loading state
      showLoadingState()
      
      // Load EV database from API
      await loadEVDatabase()
      
      // Initialize page components
      await initializeComparePage()
      
      // Hide loading state
      hideLoadingState()
    } catch (error) {
      console.error("Failed to initialize compare page:", error)
      hideLoadingState()
      showErrorState()
    }
  }
})

async function initializeComparePage() {
  console.log(`Initialized compare page with ${completeEVDatabase.length} vehicles`)

  setupVehicleSelectors()
  
  // Load comparison from API first, then fallback to localStorage
  await loadComparisonFromAPI()
  
  updateEmptyState()

  // Load comparison from URL parameters if available
  const urlParams = new URLSearchParams(window.location.search)
  const vehicles = urlParams.get("vehicles")
  if (vehicles) {
    const vehicleNames = vehicles.split(",")
    await loadComparisonFromNames(vehicleNames)
  }
}

function setupVehicleSelectors() {
  const selectors = document.querySelectorAll(".vehicle-selector")
  selectors.forEach((selector, index) => {
    selector.addEventListener("click", () => {
      currentSelectorIndex = index
      showVehicleModal()
    })
  })
}

// Load comparison from API with localStorage fallback
async function loadComparisonFromAPI() {
  try {
    // Try to get user's comparison from API
    const compareList = await getUserComparison()
    console.log("Loading comparison from API:", compareList)

    // Load vehicle details for each comparison item
    const vehiclePromises = compareList.slice(0, 3).map(async (vehicleData, index) => {
      let vehicle = null
      
      if (typeof vehicleData === 'object' && vehicleData.id) {
        // If it's already a vehicle object
        vehicle = vehicleData
      } else if (typeof vehicleData === 'number' || typeof vehicleData === 'string') {
        // If it's just an ID, fetch the details
        vehicle = await getVehicleDetails(vehicleData)
      }
      
      if (vehicle) {
        selectedVehicles[index] = vehicle
        updateVehicleSelector(index, vehicle)
      }
    })

    await Promise.all(vehiclePromises)
    updateComparisonTable()
    updateEmptyState()
    
  } catch (error) {
    console.error("Error loading comparison from API:", error)
    
    // Fallback to localStorage
    loadComparisonFromStorage()
  }
}

function loadComparisonFromStorage() {
  const compareList = JSON.parse(localStorage.getItem("compareList") || "[]")
  console.log("Loading comparison from localStorage:", compareList)

  compareList.forEach((vehicle, index) => {
    if (index < 3 && vehicle) {
      selectedVehicles[index] = vehicle
      updateVehicleSelector(index, vehicle)
    }
  })

  updateComparisonTable()
  updateEmptyState()
}

async function showVehicleModal() {
  const modal = document.getElementById("vehicleModal")
  if (!modal) return

  try {
    // Show loading in modal
    const vehicleList = document.getElementById("vehicleList")
    if (vehicleList) {
      vehicleList.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div class="loading-spinner"></div>
          <p>Loading vehicles...</p>
        </div>
      `
    }

    modal.style.display = "block"

    // Load vehicles (will use cached data if available)
    await loadEVDatabase()
    
    const availableVehicles = completeEVDatabase.filter((ev) => ev.status !== "Coming Soon")
    console.log(`${availableVehicles.length} available vehicles (excluding Coming Soon)`)

    if (vehicleList) {
      vehicleList.innerHTML = availableVehicles.map((ev) => createVehicleOption(ev)).join("")
    }

    // Setup search
    const vehicleSearch = document.getElementById("vehicleSearch")
    if (vehicleSearch) {
      vehicleSearch.value = ""
      vehicleSearch.addEventListener("input", async (e) => {
        await filterVehicleList(e.target.value)
      })
    }

    // Focus search input
    setTimeout(() => {
      if (vehicleSearch) vehicleSearch.focus()
    }, 100)
    
  } catch (error) {
    console.error("Error showing vehicle modal:", error)
    
    const vehicleList = document.getElementById("vehicleList")
    if (vehicleList) {
      vehicleList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #dc2626;">
          <p>Failed to load vehicles. Please try again.</p>
          <button onclick="showVehicleModal()" class="btn btn-primary">Retry</button>
        </div>
      `
    }
  }
}

function createVehicleOption(ev) {
  const maxBattery = Math.max(...ev.batteryOptions.map((b) => b.capacity))

  // Brand color coding
  const brandColors = {
    Tata: "#1e40af",
    Mahindra: "#dc2626",
    MG: "#059669",
    Citroën: "#7c3aed",
    Tesla: "#dc2626",
    Kia: "#059669",
    "Mercedes-Benz": "#1f2937"
  }

  const brandColor = brandColors[ev.make] || "#6b7280"

  return `
    <div class="vehicle-option" onclick="selectVehicle(${ev.id})">
      <div class="vehicle-option-content">
        <div class="vehicle-option-image" style="background: linear-gradient(135deg, ${brandColor}, ${brandColor}dd);">
          <div class="make-badge">${ev.make}</div>
        </div>
        <div class="vehicle-option-details">
          <div class="vehicle-option-name">${ev.make} ${ev.model}</div>
          <div class="vehicle-option-price">${formatCurrency(ev.priceMin)} - ${formatCurrency(ev.priceMax)}</div>
          <div class="vehicle-option-specs">
            <span>${ev.maxRange}km</span> • 
            <span>${maxBattery}kWh</span> • 
            <span>${ev.motorPower}PS</span>
          </div>
        </div>
      </div>
    </div>
  `
}

async function filterVehicleList(searchTerm) {
  const vehicleList = document.getElementById("vehicleList")
  if (!vehicleList) return

  try {
    if (!searchTerm.trim()) {
      // Show all available vehicles when search is empty
      const availableVehicles = completeEVDatabase.filter((ev) => ev.status !== "Coming Soon")
      vehicleList.innerHTML = availableVehicles.map((ev) => createVehicleOption(ev)).join("")
      return
    }

    // Show loading
    vehicleList.innerHTML = `
      <div style="text-align: center; padding: 1rem;">
        <div class="loading-spinner"></div>
        <p>Searching...</p>
      </div>
    `

    // Search via API
    const filteredVehicles = await searchVehiclesForComparison(searchTerm)
    console.log(`Filtered to ${filteredVehicles.length} vehicles for search: "${searchTerm}"`)

    vehicleList.innerHTML = filteredVehicles.map((ev) => createVehicleOption(ev)).join("")
    
  } catch (error) {
    console.error("Error filtering vehicle list:", error)
    vehicleList.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #dc2626;">
        <p>Search failed. Please try again.</p>
      </div>
    `
  }
}

async function selectVehicle(vehicleId) {
  try {
    // Get vehicle details from API
    const vehicle = await getVehicleDetails(vehicleId)
    if (!vehicle) {
      alert("Vehicle not found!")
      return
    }

    // Check if vehicle is already selected
    if (selectedVehicles.some((v) => v && v.id === vehicleId)) {
      alert(`${vehicle.fullName} is already selected for comparison!`)
      return
    }

    selectedVehicles[currentSelectorIndex] = vehicle
    updateVehicleSelector(currentSelectorIndex, vehicle)
    closeVehicleModal()
    updateComparisonTable()
    
    // Save to API and localStorage
    await updateStorage()
    updateEmptyState()

    console.log("Vehicle selected:", vehicle.fullName)
    
  } catch (error) {
    console.error("Error selecting vehicle:", error)
    alert("Failed to select vehicle. Please try again.")
  }
}

function updateVehicleSelector(index, vehicle) {
  const selector = document.getElementById(`selector${index + 1}`)
  if (!selector) return

  const maxBattery = Math.max(...vehicle.batteryOptions.map((b) => b.capacity))

  // Brand color coding
  const brandColors = {
    Tata: "#1e40af",
    Mahindra: "#dc2626",
    MG: "#059669",
    Citroën: "#7c3aed",
    Tesla: "#dc2626",
    Kia: "#059669",
    "Mercedes-Benz": "#1f2937"
  }

  const brandColor = brandColors[vehicle.make] || "#6b7280"

  selector.innerHTML = `
    <div class="selected-vehicle">
      <div class="selected-vehicle-image" style="background: linear-gradient(135deg, ${brandColor}, ${brandColor}dd);">
        <div class="make-badge">${vehicle.make}</div>
      </div>
      <div class="selected-vehicle-info">
        <div class="selected-vehicle-name">${vehicle.make} ${vehicle.model}</div>
        <div class="selected-vehicle-price">${formatCurrency(vehicle.priceMin)} - ${formatCurrency(vehicle.priceMax)}</div>
        <div class="selected-vehicle-specs">
          <span>${vehicle.maxRange}km</span> • <span>${maxBattery}kWh</span>
        </div>
      </div>
      <button class="remove-vehicle-btn" onclick="removeVehicle(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `

  selector.classList.add("selected")
}

async function removeVehicle(index) {
  selectedVehicles[index] = null
  const selector = document.getElementById(`selector${index + 1}`)

  if (selector) {
    selector.innerHTML = `
      <div class="selector-placeholder">
        <i class="fas fa-plus"></i>
        <span>Select ${index === 0 ? "First" : index === 1 ? "Second" : "Third"} Vehicle</span>
      </div>
    `
    selector.classList.remove("selected")
  }

  updateComparisonTable()
  await updateStorage()
  updateEmptyState()

  console.log("Vehicle removed from position:", index)
}

function updateComparisonTable() {
  const hasVehicles = selectedVehicles.some((v) => v !== null)
  const comparisonTable = document.getElementById("comparisonTable")

  if (!hasVehicles || !comparisonTable) {
    if (comparisonTable) comparisonTable.style.display = "none"
    return
  }

  comparisonTable.style.display = "block"

  // Update headers
  selectedVehicles.forEach((vehicle, index) => {
    const header = document.getElementById(`vehicle${index + 1}Header`)
    if (header) {
      header.innerHTML = vehicle
        ? `
          <div class="comparison-header">
            <div class="comparison-vehicle-name">${vehicle.make} ${vehicle.model}</div>
            <div class="comparison-vehicle-price">${formatCurrency(vehicle.priceMin)} - ${formatCurrency(vehicle.priceMax)}</div>
          </div>
        `
        : ""
    }
  })

  // Generate comparison rows with highlighting
  const comparisonBody = document.getElementById("comparisonBody")
  if (comparisonBody) {
    const specs = [
      { label: "Starting Price", key: "priceMin", format: "currency", compare: "lower" },
      { label: "Max Price", key: "priceMax", format: "currency", compare: "lower" },
      { label: "Range", key: "maxRange", format: "km", compare: "higher" },
      { label: "Battery Capacity", key: "batteryOptions", format: "battery", compare: "higher" },
      { label: "Motor Power", key: "motorPower", format: "power", compare: "higher" },
      { label: "Torque", key: "torque", format: "torque", compare: "higher" },
      { label: "Body Type", key: "bodyType", format: "text", compare: "none" },
      { label: "Top Speed", key: "topSpeed", format: "speed", compare: "higher" },
      { label: "Seating", key: "seating", format: "people", compare: "higher" },
      { label: "Charging", key: "chargingType", format: "text", compare: "none" },
      { label: "Warranty", key: "warranty", format: "text", compare: "none" },
    ]

    comparisonBody.innerHTML = specs.map((spec) => generateComparisonRow(spec)).join("")
  }
}

function generateComparisonRow(spec) {
  const values = selectedVehicles.map((vehicle) => {
    if (!vehicle) return null
    return getSpecValue(vehicle[spec.key], spec.format)
  })

  // Find best value for highlighting
  const bestIndices = findBestValues(values, spec.compare, spec.format)

  return `
    <div class="comparison-row">
      <div class="spec-label">${spec.label}</div>
      ${selectedVehicles
        .map(
          (vehicle, index) => `
        <div class="spec-value ${bestIndices.includes(index) ? "best" : ""}">
          ${vehicle ? formatSpecValue(vehicle[spec.key], spec.format) : "—"}
        </div>
      `,
        )
        .join("")}
    </div>
  `
}

function getSpecValue(value, format) {
  if (format === "battery" && Array.isArray(value)) {
    return Math.max(...value.map((b) => b.capacity))
  }
  return value
}

function findBestValues(values, compareType, format) {
  if (compareType === "none") return []

  const numericValues = values
    .map((val, index) => {
      if (val === null) return { value: null, index }

      let numVal = val
      if (format === "battery" && Array.isArray(val)) {
        numVal = Math.max(...val.map((b) => b.capacity))
      }

      return { value: typeof numVal === "number" ? numVal : null, index }
    })
    .filter((item) => item.value !== null)

  if (numericValues.length === 0) return []

  const bestValue =
    compareType === "higher"
      ? Math.max(...numericValues.map((item) => item.value))
      : Math.min(...numericValues.map((item) => item.value))

  return numericValues.filter((item) => item.value === bestValue).map((item) => item.index)
}

function formatSpecValue(value, format) {
  if (value === null || value === undefined) return "—"

  switch (format) {
    case "currency":
      return formatCurrency(value)
    case "km":
      return `${value} km`
    case "battery":
      if (Array.isArray(value)) {
        const maxCapacity = Math.max(...value.map((b) => b.capacity))
        return `${maxCapacity} kWh`
      }
      return `${value} kWh`
    case "power":
      return `${value} PS`
    case "torque":
      return `${value} Nm`
    case "speed":
      return `${value} km/h`
    case "people":
      return `${value} ${value === 1 ? "person" : "people"}`
    default:
      return value || "—"
  }
}

function updateEmptyState() {
  const hasVehicles = selectedVehicles.some((v) => v !== null)
  const emptyComparison = document.getElementById("emptyComparison")

  if (emptyComparison) {
    emptyComparison.style.display = hasVehicles ? "none" : "block"
  }
}

function closeVehicleModal() {
  const modal = document.getElementById("vehicleModal")
  if (modal) {
    modal.style.display = "none"
  }
}

// Update storage - both API and localStorage
async function updateStorage() {
  const compareList = selectedVehicles.filter((v) => v !== null)
  
  // Save to localStorage immediately
  localStorage.setItem("compareList", JSON.stringify(compareList))
  
  // Try to save to API
  try {
    const vehicleIds = compareList.map(v => v.id)
    await saveComparisonToAPI(vehicleIds)
    console.log("Updated API and localStorage with:", compareList.length, "vehicles")
  } catch (error) {
    console.error("Failed to save to API, using localStorage only:", error)
  }
}

async function loadPopularComparison(vehicleNames) {
  console.log("Loading popular comparison:", vehicleNames)

  try {
    // Ensure database is loaded
    await loadEVDatabase()

    // Clear current selection
    selectedVehicles = [null, null, null]

    const vehiclePromises = vehicleNames.slice(0, 3).map(async (name, index) => {
      const vehicle = completeEVDatabase.find((ev) => 
        ev.fullName === name || `${ev.make} ${ev.model}` === name
      )
      
      if (vehicle) {
        // Get fresh details from API
        const vehicleDetails = await getVehicleDetails(vehicle.id)
        if (vehicleDetails) {
          selectedVehicles[index] = vehicleDetails
          updateVehicleSelector(index, vehicleDetails)
        }
      }
    })

    await Promise.all(vehiclePromises)

    updateComparisonTable()
    await updateStorage()
    updateEmptyState()

    // Scroll to comparison table
    const comparisonTable = document.getElementById("comparisonTable")
    if (comparisonTable && comparisonTable.style.display !== "none") {
      comparisonTable.scrollIntoView({ behavior: "smooth" })
    }
    
  } catch (error) {
    console.error("Error loading popular comparison:", error)
    showErrorMessage("Failed to load comparison. Please try again.")
  }
}

async function loadComparisonFromNames(vehicleNames) {
  await loadPopularComparison(vehicleNames)
}

// Loading and error states
function showLoadingState() {
  const container = document.querySelector('.compare-container') || document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'compareLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem;">Loading vehicles for comparison...</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('compareLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
}

function showErrorState() {
  const container = document.querySelector('.compare-container') || document.body
  
  const errorDiv = document.createElement('div')
  errorDiv.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: #dc2626;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
      <h2>Failed to Load Vehicles</h2>
      <p>Please check your internet connection and try again.</p>
      <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
        Retry
      </button>
    </div>
  `
  
  container.appendChild(errorDiv)
}

function showErrorMessage(message) {
  const errorDiv = document.createElement('div')
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #fed7d7;
    border: 1px solid #feb2b2;
    color: #c53030;
    padding: 1rem;
    border-radius: 8px;
    z-index: 10000;
    max-width: 300px;
  `
  errorDiv.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <i class="fas fa-exclamation-circle"></i>
      <span>${message}</span>
    </div>
  `
  
  document.body.appendChild(errorDiv)
  
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove()
    }
  }, 5000)
}

// Close modal when clicking outside
window.addEventListener("click", (event) => {
  const modal = document.getElementById("vehicleModal")
  if (event.target === modal) {
    closeVehicleModal()
  }
})

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeVehicleModal()
  }
})

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
    margin: 0 auto;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
document.head.appendChild(style)

// Export functions for use in other files
window.compareSystem = {
  loadEVDatabase,
  getVehicleDetails,
  saveComparisonToAPI,
  getUserComparison,
  searchVehiclesForComparison
}

console.log("Compare.js loaded successfully with API integration")
