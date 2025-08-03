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
// const quizData = { questions: [...], evDatabase: [...] } // REMOVED

// Quiz data and state management
let quizData = {
  questions: [],
  evDatabase: []
}

// Quiz state management
let currentQuestion = 0
let userAnswers = {}
let quizStartTime = Date.now()

// Load quiz data from API
async function loadQuizData() {
  try {
    // Check for cached data first
    const cachedQuiz = localStorage.getItem('cachedQuizData')
    const cacheTimestamp = localStorage.getItem('cachedQuizTimestamp')
    
    if (cachedQuiz && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      
      if (cacheAge < maxAge) {
        console.log("Using cached quiz data")
        quizData = JSON.parse(cachedQuiz)
        return quizData
      }
    }

    // Fetch from API
    console.log("Fetching quiz data from API...")
    const response = await apiRequest('/quiz/data', {
      method: 'GET'
    })

    if (response.success) {
      quizData = response.data
      
      // Cache the data
      localStorage.setItem('cachedQuizData', JSON.stringify(quizData))
      localStorage.setItem('cachedQuizTimestamp', Date.now().toString())
      
      console.log(`Loaded ${quizData.questions.length} questions and ${quizData.evDatabase.length} EVs from API`)
      return quizData
    } else {
      throw new Error(response.message || 'Failed to fetch quiz data')
    }
  } catch (error) {
    console.error("Error loading quiz data:", error)
    
    // Fallback to cached data if available
    const cachedQuiz = localStorage.getItem('cachedQuizData')
    if (cachedQuiz) {
      console.log("Using cached quiz data as fallback")
      quizData = JSON.parse(cachedQuiz)
      return quizData
    }
    
    // If no cached data, throw error
    throw new Error("Unable to load quiz data")
  }
}

// Initialize quiz when page loads - API integrated
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Show loading state
    showLoadingState()
    
    // Load quiz data from API
    await loadQuizData()
    
    // Initialize quiz
    await initializeQuiz()
    
    // Hide loading state
    hideLoadingState()
  } catch (error) {
    console.error("Failed to initialize quiz:", error)
    hideLoadingState()
    showErrorState()
  }
})

// Initialize the quiz - API integrated
async function initializeQuiz() {
  currentQuestion = 0
  userAnswers = {}
  quizStartTime = Date.now()
  
  // Track quiz start
  await trackQuizActivity('quiz_started')
  
  updateProgress()
  displayQuestion()
}

// Display current question
function displayQuestion() {
  if (!quizData.questions || quizData.questions.length === 0) {
    showErrorMessage("No quiz questions available. Please try again later.")
    return
  }

  const question = quizData.questions[currentQuestion]
  if (!question) {
    showErrorMessage("Question not found. Please try again.")
    return
  }

  const quizContent = document.getElementById('quizContent')
  
  // Add loading animation
  quizContent.innerHTML = '<div class="loading"><div class="spinner"></div></div>'
  
  // Simulate loading delay for smooth transition
  setTimeout(() => {
    let questionHTML = `
      <div class="question fade-in">
        <h2>${question.question}</h2>
    `
    
    if (question.question_detail) {
      questionHTML += `<p class="question-detail">${question.question_detail}</p>`
    }
    
    if (question.type === 'single') {
      questionHTML += '<div class="question-options">'
      question.options.forEach((option, index) => {
        const isSelected = userAnswers[question.id] === option.value
        questionHTML += `
          <div class="option ${isSelected ? 'selected' : ''}" 
               onclick="selectSingleOption(${question.id}, '${option.value}', this)"
               data-value="${option.value}">
            <div class="option-text">
              <span class="option-icon">${option.icon}</span>
              ${option.text}
            </div>
          </div>
        `
      })
      questionHTML += '</div>'
      
    } else if (question.type === 'multiple') {
      questionHTML += '<div class="question-options">'
      question.options.forEach((option, index) => {
        const isSelected = userAnswers[question.id] && userAnswers[question.id].includes(option.value)
        questionHTML += `
          <div class="option ${isSelected ? 'selected' : ''}" 
               onclick="selectMultipleOption(${question.id}, '${option.value}', this)"
               data-value="${option.value}">
            <div class="option-text">
              <span class="option-icon">${option.icon}</span>
              ${option.text}
            </div>
          </div>
        `
      })
      questionHTML += '</div>'
      
    } else if (question.type === 'range') {
      const currentValue = userAnswers[question.id] || question.defaultValue
      questionHTML += `
        <div class="range-container">
          <input type="range" 
                 class="range-input" 
                 min="${question.min}" 
                 max="${question.max}" 
                 step="${question.step}" 
                 value="${currentValue}"
                 oninput="updateRangeValue(${question.id}, this.value)"
                 onchange="selectRangeOption(${question.id}, this.value)">
          <div class="range-labels">
            <span>${question.labels[0]}</span>
            <span>${question.labels[1]}</span>
          </div>
          <div class="range-value">
            <span id="rangeValue${question.id}">${currentValue}/${question.max}</span>
          </div>
        </div>
      `
    }
    
    questionHTML += '</div>'
    
    quizContent.innerHTML = questionHTML
    
    // Add fade-in animation
    setTimeout(() => {
      const questionElement = quizContent.querySelector('.question')
      if (questionElement) {
        questionElement.classList.add('visible')
      }
    }, 100)
    
  }, 300)
  
  updateNavigationButtons()
}

// Handle single option selection
async function selectSingleOption(questionId, value, element) {
  // Remove selection from all options
  const allOptions = element.parentElement.querySelectorAll('.option')
  allOptions.forEach(option => option.classList.remove('selected'))
  
  // Add selection to clicked option
  element.classList.add('selected')
  
  // Store answer
  userAnswers[questionId] = value
  
  // Track answer
  await trackQuizActivity('answer_selected', { questionId, answer: value })
  
  // Add ripple effect
  addRippleEffect(element)
  
  // Auto-advance after a short delay for better UX
  setTimeout(() => {
    if (currentQuestion < quizData.questions.length - 1) {
      nextQuestion()
    }
  }, 500)
}

// Handle multiple option selection
async function selectMultipleOption(questionId, value, element) {
  // Initialize array if it doesn't exist
  if (!userAnswers[questionId]) {
    userAnswers[questionId] = []
  }
  
  // Toggle selection
  if (userAnswers[questionId].includes(value)) {
    // Remove from selection
    userAnswers[questionId] = userAnswers[questionId].filter(item => item !== value)
    element.classList.remove('selected')
  } else {
    // Add to selection
    userAnswers[questionId].push(value)
    element.classList.add('selected')
  }
  
  // Track answer
  await trackQuizActivity('answer_updated', { questionId, answers: userAnswers[questionId] })
  
  // Add ripple effect
  addRippleEffect(element)
}

// Handle range input selection
async function selectRangeOption(questionId, value) {
  userAnswers[questionId] = parseInt(value)
  
  // Track answer
  await trackQuizActivity('range_selected', { questionId, value: parseInt(value) })
}

// Update range value display
function updateRangeValue(questionId, value) {
  const question = quizData.questions.find(q => q.id === questionId)
  const max = question ? question.max : 10
  
  const rangeValueElement = document.getElementById(`rangeValue${questionId}`)
  if (rangeValueElement) {
    rangeValueElement.textContent = `${value}/${max}`
  }
}

// Add ripple effect to clicked elements
function addRippleEffect(element) {
  const ripple = document.createElement('span')
  ripple.classList.add('ripple')
  ripple.style.left = '50%'
  ripple.style.top = '50%'
  element.appendChild(ripple)
  
  setTimeout(() => {
    ripple.remove()
  }, 600)
}

// Navigate to next question
function nextQuestion() {
  if (currentQuestion < quizData.questions.length - 1) {
    currentQuestion++
    updateProgress()
    displayQuestion()
  } else {
    finishQuiz()
  }
}

// Navigate to previous question
function previousQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--
    updateProgress()
    displayQuestion()
  }
}

// Update progress bar and navigation
function updateProgress() {
  const progress = ((currentQuestion + 1) / quizData.questions.length) * 100
  const progressFill = document.getElementById('progressFill')
  const progressText = document.getElementById('progressText')
  
  if (progressFill) {
    progressFill.style.width = `${progress}%`
  }
  
  if (progressText) {
    progressText.textContent = `Question ${currentQuestion + 1} of ${quizData.questions.length}`
  }
}

// Update navigation buttons
function updateNavigationButtons() {
  const prevBtn = document.getElementById('prevBtn')
  const nextBtn = document.getElementById('nextBtn')
  
  if (prevBtn) {
    prevBtn.style.display = currentQuestion > 0 ? 'inline-flex' : 'none'
  }
  
  if (nextBtn) {
    if (currentQuestion === quizData.questions.length - 1) {
      nextBtn.innerHTML = '<i class="fas fa-check"></i> Finish Quiz'
    } else {
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>'
    }
  }
}

// Finish quiz and show results - API integrated
async function finishQuiz() {
  try {
    const quizTime = Date.now() - quizStartTime
    
    // Show loading state
    showLoadingState("Calculating your recommendations...")
    
    // Get recommendations from API
    const recommendations = await getRecommendationsFromAPI(userAnswers)
    
    // Track quiz completion
    await trackQuizActivity('quiz_completed', { 
      completionTime: quizTime,
      totalQuestions: quizData.questions.length,
      answersCount: Object.keys(userAnswers).length
    })
    
    // Save quiz results
    await saveQuizResults(userAnswers, recommendations, quizTime)
    
    hideLoadingState()
    showResults(recommendations, quizTime)
  } catch (error) {
    console.error("Error finishing quiz:", error)
    hideLoadingState()
    
    // Fallback to local calculation
    const recommendations = calculateRecommendationsLocal(userAnswers)
    showResults(recommendations, Date.now() - quizStartTime)
  }
}

// Get recommendations from API
async function getRecommendationsFromAPI(answers) {
  try {
    const response = await apiRequest('/quiz/recommendations', {
      method: 'POST',
      body: JSON.stringify({ answers })
    })

    if (response.success) {
      return response.data.recommendations
    } else {
      throw new Error(response.message || 'Failed to get recommendations')
    }
  } catch (error) {
    console.error("API recommendations failed:", error)
    
    // Fallback to local calculation
    return calculateRecommendationsLocal(answers)
  }
}

// Calculate EV recommendations locally (fallback)
function calculateRecommendationsLocal(answers) {
  if (!quizData.evDatabase || quizData.evDatabase.length === 0) {
    return []
  }

  const recommendations = []
  
  // Get user preferences
  const budget = getBudgetRange(answers[3])
  const vehicleType = answers[2]
  const dailyDistance = answers[5]
  const rangeImportance = answers[4] || 5
  const techImportance = answers[8] || 5
  
  // Filter and score EVs
  quizData.evDatabase.forEach(ev => {
    let score = 0
    let matchReasons = []
    
    // Budget matching (high weight)
    if (ev.price >= budget.min && ev.price <= budget.max) {
      score += 30
      matchReasons.push('Within budget')
    } else if (ev.price < budget.min) {
      score += 20
      matchReasons.push('Great value')
    }
    
    // Vehicle type matching
    if (ev.type === vehicleType) {
      score += 25
      matchReasons.push('Perfect size match')
    }
    
    // Range importance
    const rangeScore = Math.min((ev.range / 300) * rangeImportance * 2, 20)
    score += rangeScore
    if (ev.range > 300) {
      matchReasons.push('Excellent range')
    }
    
    // Technology importance
    const techScore = (ev.tech_score / 100) * techImportance * 2
    score += techScore
    if (ev.tech_score > 90) {
      matchReasons.push('Advanced technology')
    }
    
    // Eco-friendliness bonus
    score += (ev.eco_score / 100) * 10
    if (ev.eco_score > 90) {
      matchReasons.push('Eco-friendly')
    }
    
    // Charging features matching
    if (answers[6] && answers[6].includes('fast-charging') && ev.charging === 'fast-charging') {
      score += 10
      matchReasons.push('Fast charging')
    }
    
    recommendations.push({
      ...ev,
      score: Math.round(score),
      matchReasons: matchReasons
    })
  })
  
  // Sort by score and return top 3
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

// Save quiz results to API
async function saveQuizResults(answers, recommendations, completionTime) {
  try {
    const response = await apiRequest('/users/quiz-results', {
      method: 'POST',
      body: JSON.stringify({
        answers,
        recommendations: recommendations.map(r => r.id),
        completionTime,
        timestamp: new Date().toISOString()
      })
    })

    if (response.success) {
      console.log("Quiz results saved successfully")
    }
  } catch (error) {
    console.error("Failed to save quiz results:", error)
    
    // Save locally as backup
    const results = {
      answers,
      recommendations,
      completionTime,
      timestamp: new Date().toISOString()
    }
    localStorage.setItem('lastQuizResults', JSON.stringify(results))
  }
}

// Track quiz activity - API integrated
async function trackQuizActivity(type, details = {}) {
  try {
    await apiRequest('/users/activity', {
      method: 'POST',
      body: JSON.stringify({
        type: 'quiz_' + type,
        details,
        timestamp: new Date().toISOString()
      })
    })
  } catch (error) {
    console.error("Failed to track quiz activity:", error)
    // Don't throw error as this is not critical
  }
}

// Get budget range from user answer
function getBudgetRange(budgetAnswer) {
  const budgetRanges = {
    'under-30k': { min: 0, max: 30000 },
    '30k-50k': { min: 30000, max: 50000 },
    '50k-70k': { min: 50000, max: 70000 },
    '70k-100k': { min: 70000, max: 100000 },
    'over-100k': { min: 100000, max: 1000000 }
  }
  
  return budgetRanges[budgetAnswer] || { min: 0, max: 1000000 }
}

// Show results modal - Enhanced
function showResults(recommendations, quizTime) {
  const modal = document.getElementById('resultsModal')
  const resultsSummary = document.getElementById('resultsSummary')
  const recommendedEVs = document.getElementById('recommendedEVs')
  
  if (!modal || !resultsSummary || !recommendedEVs) {
    console.error("Results modal elements not found")
    showErrorMessage("Unable to display results. Please try again.")
    return
  }
  
  // Generate results summary
  const summaryHTML = `
    <h4>🎉 Your Perfect EV Matches</h4>
    <p>Based on your preferences, we've found ${recommendations.length} excellent electric vehicles for you!</p>
    <div class="user-preferences">
      <div class="preference-item">
        <strong>Primary Use:</strong> ${getAnswerText(1, userAnswers[1])}
      </div>
      <div class="preference-item">
        <strong>Vehicle Type:</strong> ${getAnswerText(2, userAnswers[2])}
      </div>
      <div class="preference-item">
        <strong>Budget Range:</strong> ${getAnswerText(3, userAnswers[3])}
      </div>
      <div class="preference-item">
        <strong>Daily Distance:</strong> ${getAnswerText(5, userAnswers[5])}
      </div>
      <div class="preference-item">
        <strong>Range Importance:</strong> ${userAnswers[4] || 5}/${quizData.questions.find(q => q.id === 4)?.max || 10}
      </div>
      <div class="preference-item">
        <strong>Tech Importance:</strong> ${userAnswers[8] || 5}/${quizData.questions.find(q => q.id === 8)?.max || 10}
      </div>
    </div>
    <div class="quiz-completion-time">
      <small>Quiz completed in ${Math.round(quizTime / 1000)} seconds</small>
    </div>
  `
  
  resultsSummary.innerHTML = summaryHTML
  
  // Generate recommended EVs
  let evsHTML = ''
  if (recommendations.length === 0) {
    evsHTML = `
      <div style="text-align: center; padding: 2rem; color: #6b7280;">
        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>No specific recommendations available. Please try browsing our vehicle catalog.</p>
        <button class="btn-primary" onclick="goToBrowse()">
          Browse All Vehicles
        </button>
      </div>
    `
  } else {
    recommendations.forEach((ev, index) => {
      const matchPercentage = Math.min(ev.score, 100)
      const price = ev.price ? `$${ev.price.toLocaleString()}` : 'Price on request'
      const range = ev.range ? `${ev.range} miles range` : 'Range N/A'
      const charging = ev.charging ? ev.charging.replace('-', ' ') : 'Standard charging'
      const ecoScore = ev.eco_score ? `${ev.eco_score}% eco-score` : 'Eco-score N/A'
      
      evsHTML += `
        <div class="ev-card" style="animation-delay: ${index * 0.1}s">
          <div class="ev-header">
            <div>
              <div class="ev-title">${ev.name}</div>
              <div class="ev-brand">${ev.brand}</div>
            </div>
            <div class="ev-match">${matchPercentage}% Match</div>
          </div>
          <div class="ev-specs">
            <div class="spec-item">
              <i class="fas fa-dollar-sign"></i>
              <span>${price}</span>
            </div>
            <div class="spec-item">
              <i class="fas fa-battery-three-quarters"></i>
              <span>${range}</span>
            </div>
            <div class="spec-item">
              <i class="fas fa-bolt"></i>
              <span>${charging}</span>
            </div>
            <div class="spec-item">
              <i class="fas fa-leaf"></i>
              <span>${ecoScore}</span>
            </div>
          </div>
          <div class="match-reasons">
            <strong>Why this matches:</strong>
            <ul>
              ${ev.matchReasons && ev.matchReasons.length > 0 
                ? ev.matchReasons.map(reason => `<li>${reason}</li>`).join('')
                : '<li>Good overall match for your preferences</li>'
              }
            </ul>
          </div>
          <div class="ev-actions">
            <button class="btn-primary" onclick="learnMore('${ev.id}')">
              <i class="fas fa-info-circle"></i>
              Learn More
            </button>
            <button class="btn-secondary" onclick="compareEV('${ev.id}')">
              <i class="fas fa-balance-scale"></i>
              Compare
            </button>
          </div>
        </div>
      `
    })
  }
  
  recommendedEVs.innerHTML = evsHTML
  
  // Show modal with animation
  modal.style.display = 'block'
  setTimeout(() => {
    modal.classList.add('show')
  }, 100)
}

// Get answer text for display
function getAnswerText(questionId, answer) {
  const question = quizData.questions.find(q => q.id === questionId)
  if (!question) return 'N/A'
  
  if (question.type === 'single') {
    const option = question.options.find(opt => opt.value === answer)
    return option ? option.text : 'N/A'
  } else if (question.type === 'multiple') {
    if (Array.isArray(answer)) {
      return answer.map(val => {
        const option = question.options.find(opt => opt.value === val)
        return option ? option.text : val
      }).join(', ')
    }
    return 'N/A'
  } else if (question.type === 'range') {
    const max = question.max || 10
    return `${answer}/${max}`
  }
  
  return 'N/A'
}

// Close results modal
function closeResultsModal() {
  const modal = document.getElementById('resultsModal')
  modal.classList.remove('show')
  setTimeout(() => {
    modal.style.display = 'none'
  }, 300)
}

// Save results - API integrated
async function saveResults() {
  try {
    const results = {
      answers: userAnswers,
      timestamp: new Date().toISOString(),
      completionTime: Date.now() - quizStartTime
    }
    
    const response = await apiRequest('/users/quiz-results', {
      method: 'POST',
      body: JSON.stringify(results)
    })
    
    if (response.success) {
      showNotification('Results saved successfully! 🎉', 'success')
    } else {
      throw new Error(response.message || 'Failed to save results')
    }
  } catch (error) {
    console.error("Failed to save results:", error)
    
    // Save locally as fallback
    const results = {
      answers: userAnswers,
      timestamp: new Date().toISOString(),
      completionTime: Date.now() - quizStartTime
    }
    localStorage.setItem('quizResults', JSON.stringify(results))
    showNotification('Results saved locally! 🎉', 'success')
  }
  
  closeResultsModal()
}

// Retake quiz
async function retakeQuiz() {
  closeResultsModal()
  await trackQuizActivity('quiz_retaken')
  await initializeQuiz()
}

// Learn more about an EV - API integrated
async function learnMore(evId) {
  try {
    await trackQuizActivity('ev_details_viewed', { evId })
    window.location.href = `vehicle-details.html?id=${evId}`
  } catch (error) {
    console.error("Error navigating to EV details:", error)
    showNotification('Redirecting to EV details...', 'info')
  }
}

// Compare EV - API integrated
async function compareEV(evId) {
  try {
    const response = await apiRequest('/users/comparison', {
      method: 'POST',
      body: JSON.stringify({ vehicleId: evId })
    })
    
    if (response.success) {
      await trackQuizActivity('ev_added_to_comparison', { evId })
      showNotification('Added to comparison list! 📊', 'success')
    } else {
      throw new Error(response.message || 'Failed to add to comparison')
    }
  } catch (error) {
    console.error("Failed to add to comparison:", error)
    showNotification('Failed to add to comparison. Please try again.', 'error')
  }
}

// Navigation functions
function goToBrowse() {
  window.location.href = 'browse.html'
}

// Loading states
function showLoadingState(message = "Loading quiz...") {
  const container = document.querySelector('.quiz-container') || document.body
  
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'quizLoadingState'
  loadingDiv.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.95); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="text-align: center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 1rem; font-size: 1.1rem; color: #6b7280;">${message}</p>
      </div>
    </div>
  `
  
  container.appendChild(loadingDiv)
}

function hideLoadingState() {
  const loadingDiv = document.getElementById('quizLoadingState')
  if (loadingDiv) {
    loadingDiv.remove()
  }
}

// Error state
function showErrorState() {
  const container = document.querySelector('.quiz-container') || document.body
  
  const errorDiv = document.createElement('div')
  errorDiv.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: #dc2626;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
      <h2>Unable to Load Quiz</h2>
      <p>We're having trouble loading the quiz questions. Please check your connection and try again.</p>
      <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
        Retry
      </button>
    </div>
  `
  
  container.appendChild(errorDiv)
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div')
  notification.className = `notification ${type}`
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation' : 'info'}-circle"></i>
    <span>${message}</span>
  `
  
  document.body.appendChild(notification)
  
  // Show notification
  setTimeout(() => {
    notification.classList.add('show')
  }, 100)
  
  // Hide notification after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show')
    setTimeout(() => {
      notification.remove()
    }, 300)
  }, 3000)
}

// Show error message
function showErrorMessage(message) {
  showNotification(message, 'error')
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowLeft' && currentQuestion > 0) {
    previousQuestion()
  } else if (e.key === 'ArrowRight' && currentQuestion < quizData.questions.length - 1) {
    nextQuestion()
  } else if (e.key === 'Enter' && currentQuestion === quizData.questions.length - 1) {
    finishQuiz()
  }
})

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
  
  .question {
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.3s ease;
  }
  
  .question.visible {
    opacity: 1;
    transform: translateY(0);
  }
  
  .fade-in {
    animation: fadeIn 0.5s ease-in-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .ev-card {
    animation: slideInUp 0.5s ease-out forwards;
    opacity: 0;
    transform: translateY(30px);
  }
  
  @keyframes slideInUp {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: var(--white);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 20px var(--shadow-medium);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    z-index: 1001;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }
  
  .notification.show {
    transform: translateX(0);
  }
  
  .notification.success {
    border-left: 4px solid var(--leaf-green);
  }
  
  .notification.error {
    border-left: 4px solid #e74c3c;
  }
  
  .notification.info {
    border-left: 4px solid var(--accent-green);
  }
  
  .notification i {
    color: var(--accent-green);
  }
  
  .notification.success i {
    color: var(--leaf-green);
  }
  
  .notification.error i {
    color: #e74c3c;
  }
  
  .ripple {
    position: absolute;
    border-radius: 50%;
    transform: scale(0);
    animation: rippleEffect 0.6s linear;
    background-color: rgba(255, 255, 255, 0.3);
  }
  
  @keyframes rippleEffect {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  .match-reasons {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--nature-bg);
    border-radius: var(--radius-sm);
  }
  
  .match-reasons ul {
    list-style: none;
    margin-top: var(--spacing-xs);
  }
  
  .match-reasons li {
    padding: var(--spacing-xs) 0;
    position: relative;
    padding-left: var(--spacing-md);
  }
  
  .match-reasons li::before {
    content: "✓";
    position: absolute;
    left: 0;
    color: var(--leaf-green);
    font-weight: bold;
  }
  
  .ev-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }
  
  .quiz-completion-time {
    text-align: center;
    margin-top: var(--spacing-md);
    opacity: 0.7;
  }
  
  .question-detail {
    color: var(--text-light);
    font-size: 0.95rem;
    margin-bottom: var(--spacing-lg);
    font-style: italic;
  }
  
  .option-icon {
    font-size: 1.2rem;
    margin-right: var(--spacing-sm);
  }
`
document.head.appendChild(style)

// Export functions for use in other files
window.quizSystem = {
  loadQuizData,
  initializeQuiz,
  getRecommendationsFromAPI,
  trackQuizActivity,
  saveQuizResults
}

console.log("Quiz.js loaded successfully with API integration")
