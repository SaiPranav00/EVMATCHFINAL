// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000/api"

// Remove hardcoded credentials and users
// const SAMPLE_CREDENTIALS = { ... } // REMOVED
// const DEMO_USER = { ... } // REMOVED
// let REGISTERED_USERS = [ ... ] // REMOVED

// API Helper Functions
const apiRequest = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
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

// DOM Elements
const signinForm = document.getElementById("signinForm")
const signupForm = document.getElementById("signupForm")
const forgotPasswordForm = document.getElementById("forgotPasswordForm")

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  // Check if user is already logged in
  checkExistingAuth()

  // Add event listeners based on current page
  if (signinForm) {
    signinForm.addEventListener("submit", handleSignin)
  }

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup)

    // Password strength checker
    const passwordInput = document.getElementById("signupPassword")
    if (passwordInput) {
      passwordInput.addEventListener("input", checkPasswordStrength)
    }

    // Password confirmation checker
    const confirmPasswordInput = document.getElementById("confirmPassword")
    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener("input", checkPasswordMatch)
    }
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPassword)
  }

  // Display success message if redirected from signup
  const urlParams = new URLSearchParams(window.location.search)
  const message = urlParams.get("message")
  if (message) {
    showSuccessMessage(decodeURIComponent(message))
  }
})

// Check if user is already authenticated
function checkExistingAuth() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  if (token) {
    // Verify token with API
    verifyToken(token).then(isValid => {
      if (isValid) {
        console.log("User already authenticated, redirecting to dashboard...")
        window.location.href = "dashboard.html"
      } else {
        // Clear invalid token
        clearAuthData()
      }
    })
  }
}

// Verify token with API
async function verifyToken(token) {
  try {
    const response = await apiRequest('/auth/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    return response.success
  } catch (error) {
    console.error('Token verification failed:', error)
    return false
  }
}

// Clear authentication data
function clearAuthData() {
  localStorage.removeItem("authToken")
  localStorage.removeItem("user")
  sessionStorage.removeItem("authToken")
  sessionStorage.removeItem("user")
}

// Sign in handler - API integrated
async function handleSignin(e) {
  e.preventDefault()

  const email = document.getElementById("email").value.trim()
  const password = document.getElementById("password").value
  const rememberMe = document.getElementById("rememberMe")?.checked || false

  console.log("Sign in attempt:", { email, rememberMe })

  // Validate form
  if (!validateSigninForm(email, password)) {
    return
  }

  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...'
  submitBtn.disabled = true

  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })

    if (response.success) {
      console.log("✅ Login successful")

      // Store token based on remember me preference
      const storage = rememberMe ? localStorage : sessionStorage
      storage.setItem("authToken", response.data.token)
      storage.setItem("user", JSON.stringify(response.data.user))

      showSuccessMessage("✅ Sign in successful! Redirecting to dashboard...", () => {
        window.location.href = "dashboard.html"
      })
    } else {
      showErrorMessage(response.message || "❌ Invalid email or password.")
    }
  } catch (error) {
    console.error("Sign in error:", error)
    showErrorMessage("❌ Invalid email or password. Please check your credentials.")
  } finally {
    // Reset button state
    setTimeout(() => {
      submitBtn.innerHTML = originalText
      submitBtn.disabled = false
    }, 2000)
  }
}

// Sign up handler - API integrated
async function handleSignup(e) {
  e.preventDefault()

  console.log("Signup form submitted")
  clearMessages()

  const formData = new FormData(e.target)
  const firstName = formData.get("firstName")
  const lastName = formData.get("lastName")
  const email = formData.get("email")
  const password = formData.get("password")
  const confirmPassword = formData.get("confirmPassword")

  console.log("Form data:", { firstName, lastName, email })

  // Client-side validation
  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    showErrorMessage("Please fill in all required fields.")
    return
  }

  if (password !== confirmPassword) {
    showErrorMessage("Passwords do not match.")
    return
  }

  if (password.length < 6) {
    showErrorMessage("Password must be at least 6 characters long.")
    return
  }

  if (!document.getElementById("terms")?.checked) {
    showErrorMessage("Please accept the Terms of Service and Privacy Policy.")
    return
  }

  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...'
  submitBtn.disabled = true

  try {
    console.log("Creating account...")

    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password
      })
    })

    if (response.success) {
      console.log("✅ Registration successful")

      // Show success message and redirect
      showSuccessMessage("✅ Account created successfully! You can now sign in with your credentials.", () => {
        console.log("Redirecting to sign in...")
        window.location.href = "index.html?message=Account created successfully! You can now sign in with your credentials."
      })
    } else {
      showErrorMessage(response.message || "Registration failed. Please try again.")
    }
  } catch (error) {
    console.error("Signup error:", error)
    
    // Handle specific error cases
    if (error.message.includes('already exists')) {
      showErrorMessage("An account with this email already exists. Please sign in instead.")
    } else {
      showErrorMessage("An unexpected error occurred. Please try again.")
    }
  } finally {
    // Reset button state after a delay
    setTimeout(() => {
      submitBtn.innerHTML = originalText
      submitBtn.disabled = false
    }, 2000)
  }
}

// Forgot password handler - API integrated
async function handleForgotPassword(e) {
  e.preventDefault()

  const email = document.getElementById("resetEmail").value.trim()

  if (!email) {
    showErrorMessage("Please enter your email address.")
    return
  }

  if (!isValidEmail(email)) {
    showErrorMessage("Please enter a valid email address.")
    return
  }

  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]')
  const originalText = submitBtn.innerHTML
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'
  submitBtn.disabled = true

  try {
    const response = await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    })

    showSuccessMessage(
      response.message || `Password reset link sent to ${email}. Please check your inbox.`,
      () => {
        window.location.href = "index.html"
      }
    )
  } catch (error) {
    console.error("Forgot password error:", error)
    showErrorMessage("Failed to send reset email. Please try again.")
  } finally {
    // Reset button state
    submitBtn.innerHTML = originalText
    submitBtn.disabled = false
  }
}

// User Management Functions - API integrated
async function signIn(email, password) {
  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })

    if (response.success) {
      // Store user session
      localStorage.setItem("authToken", response.data.token)
      localStorage.setItem("user", JSON.stringify(response.data.user))
      localStorage.setItem("isLoggedIn", "true")

      return {
        success: true,
        user: response.data.user,
        message: "Sign in successful!"
      }
    } else {
      return {
        success: false,
        message: response.message || "Invalid credentials"
      }
    }
  } catch (error) {
    console.error("Sign in error:", error)
    return {
      success: false,
      message: "An error occurred during sign in. Please try again."
    }
  }
}

async function signUp(userData) {
  try {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    })

    if (response.success) {
      return {
        success: true,
        message: "Account created successfully! You can now sign in."
      }
    } else {
      return {
        success: false,
        message: response.message || "Registration failed"
      }
    }
  } catch (error) {
    console.error("Sign up error:", error)
    return {
      success: false,
      message: "An error occurred during registration. Please try again."
    }
  }
}

// Sign out function - API integrated
async function signOut() {
  try {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    
    if (token) {
      // Call API to invalidate token
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    }
  } catch (error) {
    console.error("Logout API call failed:", error)
    // Continue with local cleanup even if API call fails
  } finally {
    // Clear local storage
    clearAuthData()
    localStorage.removeItem("isLoggedIn")
    window.location.href = "index.html"
  }
}

// Get current user - API integrated
async function getCurrentUser() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  
  if (!token) {
    return null
  }

  try {
    const response = await apiRequest('/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.success) {
      return response.data.user
    }
  } catch (error) {
    console.error("Get current user error:", error)
    clearAuthData()
  }
  
  return null
}

// Check if user is logged in - API integrated
async function isLoggedIn() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  
  if (!token) {
    return false
  }

  try {
    const isValid = await verifyToken(token)
    if (!isValid) {
      clearAuthData()
      return false
    }
    return true
  } catch (error) {
    console.error("Auth check error:", error)
    clearAuthData()
    return false
  }
}

// Protect pages that require authentication
async function requireAuth() {
  const loggedIn = await isLoggedIn()
  
  if (!loggedIn) {
    window.location.href = "index.html?message=Please sign in to access this page."
    return false
  }
  return true
}

// Utility Functions (kept the same)
function togglePassword(inputId) {
  const input = document.getElementById(inputId)
  const button = input.parentElement.querySelector(".toggle-password i")

  if (input.type === "password") {
    input.type = "text"
    button.classList.remove("fa-eye")
    button.classList.add("fa-eye-slash")
  } else {
    input.type = "password"
    button.classList.remove("fa-eye-slash")
    button.classList.add("fa-eye")
  }
}

function checkPasswordStrength(e) {
  const password = e.target.value
  const strengthBar = document.querySelector(".strength-fill")
  const strengthText = document.querySelector(".strength-text")

  if (!strengthBar || !strengthText) return

  let strength = 0
  let strengthLabel = "Weak"
  let color = "#e53e3e"

  // Check password criteria
  if (password.length >= 8) strength += 25
  if (/[a-z]/.test(password)) strength += 25
  if (/[A-Z]/.test(password)) strength += 25
  if (/[0-9]/.test(password)) strength += 25
  if (/[^A-Za-z0-9]/.test(password)) strength += 25

  // Determine strength level
  if (strength >= 100) {
    strengthLabel = "Very Strong"
    color = "#38a169"
  } else if (strength >= 75) {
    strengthLabel = "Strong"
    color = "#68d391"
  } else if (strength >= 50) {
    strengthLabel = "Medium"
    color = "#f6ad55"
  } else if (strength >= 25) {
    strengthLabel = "Fair"
    color = "#fc8181"
  }

  // Update UI
  strengthBar.style.width = `${Math.min(strength, 100)}%`
  strengthBar.style.background = color
  strengthText.textContent = `Password strength: ${strengthLabel}`
  strengthText.style.color = color
}

function checkPasswordMatch(e) {
  const password = document.getElementById("signupPassword").value
  const confirmPassword = e.target.value
  const input = e.target

  if (confirmPassword && password !== confirmPassword) {
    input.style.borderColor = "#e53e3e"
    input.style.background = "#fed7d7"
  } else {
    input.style.borderColor = "#e2e8f0"
    input.style.background = "#f7fafc"
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function clearMessages() {
  const existingMessages = document.querySelectorAll(".success-message, .error-message")
  existingMessages.forEach((msg) => msg.remove())
}

function showSuccessMessage(message, callback) {
  clearMessages()

  const successDiv = document.createElement("div")
  successDiv.className = "success-message"
  successDiv.style.cssText = `
    background: #d1fae5;
    border: 1px solid #a7f3d0;
    color: #065f46;
    padding: 16px 20px;
    border-radius: 8px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `
  successDiv.innerHTML = `
    <i class="fas fa-check-circle" style="color: #10b981;"></i>
    <span>${message}</span>
  `

  // Insert at the top of the form
  const form = document.querySelector(".auth-form") || document.querySelector("form")
  if (form && form.parentNode) {
    form.parentNode.insertBefore(successDiv, form)
  } else {
    document.body.appendChild(successDiv)
  }

  if (callback) {
    setTimeout(() => {
      callback()
    }, 1500)
  }
}

function showErrorMessage(message) {
  clearMessages()

  const errorDiv = document.createElement("div")
  errorDiv.className = "error-message"
  errorDiv.style.cssText = `
    background: #fed7d7;
    border: 1px solid #feb2b2;
    color: #c53030;
    padding: 16px 20px;
    border-radius: 8px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `
  errorDiv.innerHTML = `
    <i class="fas fa-exclamation-circle" style="color: #e53e3e;"></i>
    <span>${message}</span>
  `

  // Insert at the top of the form
  const form = document.querySelector(".auth-form") || document.querySelector("form")
  if (form && form.parentNode) {
    form.parentNode.insertBefore(errorDiv, form)
  } else {
    document.body.appendChild(errorDiv)
  }

  // Auto-remove error after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove()
    }
  }, 5000)
}

function validateSigninForm(email, password) {
  if (!email || !password) {
    showErrorMessage("Please fill in all required fields.")
    return false
  }

  if (!isValidEmail(email)) {
    showErrorMessage("Please enter a valid email address.")
    return false
  }

  return true
}

// Google sign in simulation
document.addEventListener("click", (e) => {
  if (e.target.closest(".btn-google")) {
    e.preventDefault()
    alert("Google Sign-In would be integrated here with actual OAuth implementation.")
  }
})

// Add CSS animation
const style = document.createElement("style")
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes slideInDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`
document.head.appendChild(style)

// Export functions for use in other files
window.authSystem = {
  signIn,
  signUp,
  signOut,
  isLoggedIn,
  getCurrentUser,
  requireAuth,
  clearAuthData
}
