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

// Initialize dashboard
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Dashboard loading...")

  try {
    // Show loading state
    showLoadingState()

    await checkAuthentication()
    await loadDashboardData()
    setupEventListeners()

    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize dashboard:", error)
    hideLoadingState()
    showError("Failed to load dashboard. Please try again.")
  }
})

// Check if user is authenticated - API integrated
async function checkAuthentication() {
  authToken = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")

  console.log("Checking authentication, token:", authToken ? "present" : "missing")

  if (!authToken) {
    console.log("No token found, redirecting to login")
    redirectToLogin()
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

    // Clear invalid token
    clearAuthData()
    redirectToLogin()
  }
}

// Update user interface with user data
function updateUserInterface() {
  if (!currentUser) return

  console.log("Updating UI with user:", currentUser.email)

  // Update user name
  const userName = document.getElementById("userName")
  if (userName) {
    userName.textContent = currentUser.firstName || "User"
  }

  // Update user initials
  const userInitials = document.getElementById("userInitials")
  if (userInitials) {
    const initials = (currentUser.firstName?.[0] || "") + (currentUser.lastName?.[0] || "")
    userInitials.textContent = initials || "U"
  }

  // Update user email in profile section
  const userEmail = document.getElementById("userEmail")
  if (userEmail) {
    userEmail.textContent = currentUser.email
  }

  // Update profile image if available
  const userAvatar = document.getElementById("userAvatar")
  if (userAvatar && currentUser.profileImage) {
    const img = userAvatar.querySelector('img')
    if (img) {
      img.src = currentUser.profileImage
    }
  }
}

// Load dashboard data - API integrated
async function loadDashboardData() {
  try {
    // Load all dashboard data concurrently
    const [statsResult, evsResult, activityResult] = await Promise.allSettled([
      loadUserStats(),
      loadPopularEVs(),
      loadRecentActivity()
    ])

    // Log any failures
    if (statsResult.status === 'rejected') {
      console.error("Failed to load user stats:", statsResult.reason)
    }
    if (evsResult.status === 'rejected') {
      console.error("Failed to load popular EVs:", evsResult.reason)
    }
    if (activityResult.status === 'rejected') {
      console.error("Failed to load recent activity:", activityResult.reason)
    }

  } catch (error) {
    console.error("Failed to load dashboard data:", error)
    showError("Some dashboard data failed to load. Please refresh the page.")
  }
}

// Load user statistics - API integrated
async function loadUserStats() {
  try {
    const response = await apiRequest('/users/stats', {
      method: 'GET'
    })

    if (response.success) {
      const stats = response.data
      updateStatsUI(stats)
    } else {
      throw new Error(response.message || 'Failed to load stats')
    }
  } catch (error) {
    console.error("Failed to load user stats:", error)

    // Try to load from cache
    const cachedStats = getCachedStats()
    if (cachedStats) {
      updateStatsUI(cachedStats)
    } else {
      // Show loading state for stats
      showStatsLoadingState()
    }
  }
}

// Update stats UI
function updateStatsUI(stats) {
  const elements = {
    viewedCount: document.getElementById("viewedCount"),
    favoritesCount: document.getElementById("favoritesCount"),
    comparisonsCount: document.getElementById("comparisonsCount"),
    quizScore: document.getElementById("quizScore")
  }

  if (elements.viewedCount) elements.viewedCount.textContent = stats.viewedCount || 0
  if (elements.favoritesCount) elements.favoritesCount.textContent = stats.favoritesCount || 0
  if (elements.comparisonsCount) elements.comparisonsCount.textContent = stats.comparisonsCount || 0
  if (elements.quizScore) elements.quizScore.textContent = stats.quizScore ? `${stats.quizScore}%` : "-"

  // Cache stats
  cacheStats(stats)
}

// Cache stats for offline use
function cacheStats(stats) {
  try {
    localStorage.setItem('cachedUserStats', JSON.stringify(stats))
    localStorage.setItem('cachedUserStatsTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache user stats:", error)
  }
}

// Get cached stats
function getCachedStats() {
  try {
    const cached = localStorage.getItem('cachedUserStats')
    const timestamp = localStorage.getItem('cachedUserStatsTimestamp')

    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      const maxAge = 30 * 60 * 1000 // 30 minutes

      if (age < maxAge) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    console.warn("Failed to get cached stats:", error)
  }

  return null
}

// Show stats loading state
function showStatsLoadingState() {
  const elements = {
    viewedCount: document.getElementById("viewedCount"),
    favoritesCount: document.getElementById("favoritesCount"),
    comparisonsCount: document.getElementById("comparisonsCount"),
    quizScore: document.getElementById("quizScore")
  }

  Object.values(elements).forEach(el => {
    if (el) el.textContent = "..."
  })
}

// Load popular EVs - API integrated
async function loadPopularEVs() {
  const container = document.getElementById("popularEVs")
  if (!container) return

  try {
    // Show loading state
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Loading popular EVs...</p>
      </div>
    `

    const response = await apiRequest('/vehicles/popular?limit=4', {
      method: 'GET'
    })

    if (response.success && response.data.vehicles && response.data.vehicles.length > 0) {
      container.innerHTML = response.data.vehicles
        .map((ev) => createEVCard(ev))
        .join("")
    } else {
      throw new Error('No popular EVs found')
    }
  } catch (error) {
    console.error("Failed to load popular EVs:", error)

    // Try to load from cache
    const cachedEVs = getCachedPopularEVs()
    if (cachedEVs) {
      container.innerHTML = cachedEVs.map((ev) => createEVCard(ev)).join("")
    } else {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #6b7280;">
          <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>Failed to load popular EVs. Please try again later.</p>
        </div>
      `
    }
  }
}

// Cache popular EVs
function cachePopularEVs(evs) {
  try {
    localStorage.setItem('cachedPopularEVs', JSON.stringify(evs))
    localStorage.setItem('cachedPopularEVsTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache popular EVs:", error)
  }
}

// Get cached popular EVs
function getCachedPopularEVs() {
  try {
    const cached = localStorage.getItem('cachedPopularEVs')
    const timestamp = localStorage.getItem('cachedPopularEVsTimestamp')

    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      const maxAge = 60 * 60 * 1000 // 1 hour

      if (age < maxAge) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    console.warn("Failed to get cached popular EVs:", error)
  }

  return null
}

// Create EV card HTML - Enhanced
function createEVCard(ev) {
  const price = ev.priceMin ? `₹${ev.priceMin}L - ₹${ev.priceMax}L` : `₹${ev.price?.toLocaleString() || 'N/A'}`
  const range = ev.maxRange ? `${ev.maxRange} km` : `${ev.range || 'N/A'} km`
  const efficiency = ev.efficiency ? `${ev.efficiency} km/kWh` : 'N/A'
  const fullName = ev.fullName || `${ev.make} ${ev.model}`
  const imageUrl = ev.image || `/placeholder.svg?height=60&width=80&text=${encodeURIComponent(fullName)}`

  return `
    <div class="ev-card" onclick="viewEVDetails('${ev.id}')" style="cursor: pointer;">
      <div class="ev-image">
        <img src="${imageUrl}" alt="${fullName}" onerror="this.src='/placeholder.svg?height=60&width=80&text=${encodeURIComponent(fullName)}'">
      </div>
      <div class="ev-details">
        <div class="ev-name">${fullName}</div>
        <div class="ev-specs">
          <span>${range}</span>
          <span>${efficiency}</span>
        </div>
      </div>
      <div class="ev-price">${price}</div>
    </div>
  `
}

// Load recent activity - API integrated
async function loadRecentActivity() {
  const container = document.getElementById("activityFeed")
  if (!container) return

  try {
    // Show loading state
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <div class="loading-spinner"></div>
        <p>Loading recent activity...</p>
      </div>
    `

    const response = await apiRequest('/users/activity?limit=5', {
      method: 'GET'
    })

    if (response.success && response.data.activities && response.data.activities.length > 0) {
      container.innerHTML = response.data.activities
        .map((activity) => createActivityItem(activity))
        .join("")
    } else {
      throw new Error('No recent activity found')
    }
  } catch (error) {
    console.error("Failed to load recent activity:", error)

    // Try to load from cache
    const cachedActivity = getCachedActivity()
    if (cachedActivity) {
      container.innerHTML = cachedActivity.map((activity) => createActivityItem(activity)).join("")
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #6b7280;">
          <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>No recent activity found.</p>
        </div>
      `
    }
  }
}

// Cache recent activity
function cacheActivity(activities) {
  try {
    localStorage.setItem('cachedActivity', JSON.stringify(activities))
    localStorage.setItem('cachedActivityTimestamp', Date.now().toString())
  } catch (error) {
    console.warn("Failed to cache activity:", error)
  }
}

// Get cached activity
function getCachedActivity() {
  try {
    const cached = localStorage.getItem('cachedActivity')
    const timestamp = localStorage.getItem('cachedActivityTimestamp')

    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      const maxAge = 15 * 60 * 1000 // 15 minutes

      if (age < maxAge) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    console.warn("Failed to get cached activity:", error)
  }

  return null
}

// Create activity item HTML - Enhanced
function createActivityItem(activity) {
  const iconMap = {
    view: "fas fa-eye",
    favorite: "fas fa-heart",
    compare: "fas fa-balance-scale",
    quiz: "fas fa-question-circle",
    charging: "fas fa-bolt",
    search: "fas fa-search"
  }

  const colorMap = {
    view: "#10b981",
    favorite: "#dc2626",
    compare: "#7c3aed",
    quiz: "#f59e0b",
    charging: "#059669",
    search: "#3b82f6"
  }

  const icon = iconMap[activity.type] || "fas fa-info-circle"
  const color = colorMap[activity.type] || "#6b7280"
  const timeAgo = formatTimeAgo(activity.timestamp || activity.time)

  return `
    <div class="activity-item">
      <div class="activity-icon" style="background: ${color}20; color: ${color};">
        <i class="${icon}"></i>
      </div>
      <div class="activity-content">
        <div class="activity-text">${activity.description || activity.text}</div>
        <div class="activity-time">${timeAgo}</div>
      </div>
    </div>
  `
}

// Format time ago
function formatTimeAgo(timestamp) {
  if (!timestamp) return "Unknown time"

  const now = new Date()
  const past = new Date(timestamp)
  const diffMs = now - past

  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return past.toLocaleDateString()
}

// Setup event listeners
function setupEventListeners() {
  const userAvatar = document.getElementById("userAvatar")
  const userDropdown = document.getElementById("userDropdown")

  console.log("Setting up event listeners...");
  console.log("User avatar element:", userAvatar);
  console.log("User dropdown element:", userDropdown);

  if (userAvatar && userDropdown) {
    userAvatar.addEventListener("click", (e) => {
      console.log("User avatar clicked!");
      e.stopPropagation()
      userDropdown.classList.toggle("show")
      console.log("Dropdown classes after toggle:", userDropdown.className);
    })

    document.addEventListener("click", () => {
      userDropdown.classList.remove("show")
    })

    userDropdown.addEventListener("click", (e) => {
      console.log("Dropdown clicked!");
      e.stopPropagation()
    })
  } else {
    console.log("Error: Could not find user avatar or dropdown elements");
  }

  // Setup quick action buttons
  setupQuickActions()
}

// Setup quick action buttons
function setupQuickActions() {
  const quickActions = {
    'browseEVs': () => window.location.href = 'browse.html',
    'compareEVs': () => window.location.href = 'compare.html',
    'takeQuiz': () => window.location.href = 'quiz.html',
    'findCharging': () => window.location.href = 'charging.html'
  }

  Object.entries(quickActions).forEach(([id, action]) => {
    const button = document.getElementById(id)
    if (button) {
      button.addEventListener('click', action)
    }
  })
}

// View EV details - API integrated
async function viewEVDetails(evId) {
  try {
    // Track activity
    await trackActivity("view", evId)

    // Navigate to EV details page
    window.location.href = `vehicle-details.html?id=${evId}`
  } catch (error) {
    console.error("Error viewing EV details:", error)
    showError("Failed to load EV details. Please try again.")
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
function openProfile() {
  console.log("Profile button clicked - redirecting to profile.html");
  try {
    window.location.href = "profile.html";
  } catch (error) {
    console.error("Error opening profile:", error);
    alert("Error opening profile: " + error.message);
  }
}

function openFavorites() {
  window.location.href = "favorites.html"
}

function openSettings() {
  window.location.href = "settings.html"
}

// Handle logout - API integrated
function handleLogout() {
  if (confirm("Are you sure you want to logout?")) {
    performLogout()
  }
}

// Perform logout - API integrated
async function performLogout() {
  try {
    // Show loading state
    const logoutBtn = document.querySelector('[onclick="handleLogout()"]')
    if (logoutBtn) {
      logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...'
      logoutBtn.disabled = true
    }

    // Call logout API
    await apiRequest('/auth/logout', {
      method: 'POST'
    })

    clearAuthData()
    showSuccessMessage("Logged out successfully!")

    setTimeout(() => {
      redirectToLogin()
    }, 1500)
  } catch (error) {
    console.error("Logout request failed:", error)

    // Clear data anyway
    clearAuthData()
    showSuccessMessage("Logged out successfully!")

    setTimeout(() => {
      redirectToLogin()
    }, 1500)
  }
}

// Clear authentication data
function clearAuthData() {
  localStorage.removeItem("authToken")
  sessionStorage.removeItem("authToken")
  localStorage.removeItem("user")
  sessionStorage.removeItem("user")

  // Clear cached data
  localStorage.removeItem("cachedUserStats")
  localStorage.removeItem("cachedPopularEVs")
  localStorage.removeItem("cachedActivity")
}

// Redirect to login page
function redirectToLogin() {
  window.location.href = "index.html?message=Please sign in to access your dashboard"
}

// Loading states
function showLoadingState() {
  const container = document.querySelector('.dashboard-container') || document.body

  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'dashboardLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">Loading your dashboard...</p>
      </div>
    </div>
  `

  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('dashboardLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
}

// Message functions
function showSuccessMessage(message) {
  const successDiv = document.createElement("div")
  successDiv.className = "success-message"
  successDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #d1fae5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    padding: 1rem;
    border-radius: 8px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `
  successDiv.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span>${message}</span>
  `

  document.body.appendChild(successDiv)

  setTimeout(() => {
    successDiv.remove()
  }, 3000)
}

function showError(message) {
  const errorDiv = document.createElement("div")
  errorDiv.className = "error-message"
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle"></i>
    <span>${message}</span>
  `

  document.body.appendChild(errorDiv)

  setTimeout(() => {
    errorDiv.remove()
  }, 5000)
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
    margin: 0 auto;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .success-message, .error-message {
    animation: slideInRight 0.3s ease-out;
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
`
document.head.appendChild(style)

// Export functions for use in other files
window.dashboardSystem = {
  checkAuthentication,
  loadDashboardData,
  trackActivity,
  getCurrentUser: () => currentUser,
  getAuthToken: () => authToken
}

console.log("Dashboard.js loaded successfully with API integration")
