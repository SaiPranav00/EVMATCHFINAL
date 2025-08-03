// Charging stations functionality
let currentLocation = null
let filteredStations = []
const chargingStations = [
    // Example charging stations data
    {
        id: 1,
        name: "Station A",
        address: "123 Main St",
        network: "Tesla",
        type: "Level 1",
        power: "10",
        available: 1,
        total: 2,
        price: "$2",
        distance: "0.5 miles",
        status: "available",
    },
    {
        id: 2,
        name: "Station B",
        address: "456 Elm St",
        network: "ChargePoint",
        type: "Level 2",
        power: "20",
        available: 0,
        total: 1,
        price: "$3",
        distance: "1 mile",
        status: "occupied",
    },
    // Add more stations as needed
]

// Initialize charging page
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.pathname.includes("charging.html")) {
        initializeChargingPage()
    }
})

function initializeChargingPage() {
    loadStations()
    setupFilters()
}

function setupFilters() {
    // Charging speed filters
    const speedFilters = document.querySelectorAll(
        'input[value="Level 1"], input[value="Level 2"], input[value="DC Fast"]',
    )
    speedFilters.forEach((filter) => {
        filter.addEventListener("change", applyStationFilters)
    })

    // Network filters
    const networkFilters = document.querySelectorAll(
        'input[value="Tesla"], input[value="ChargePoint"], input[value="Electrify America"], input[value="EVgo"]',
    )
    networkFilters.forEach((filter) => {
        filter.addEventListener("change", applyStationFilters)
    })

    // Availability filters
    const availabilityFilters = document.querySelectorAll('input[value="available"], input[value="occupied"]')
    availabilityFilters.forEach((filter) => {
        filter.addEventListener("change", applyStationFilters)
    })

    // Sort select
    const stationSort = document.getElementById("stationSort")
    if (stationSort) {
        stationSort.addEventListener("change", sortStations)
    }
}

function searchLocation() {
    const locationInput = document.getElementById("locationInput")
    if (!locationInput) return

    const location = locationInput.value.trim()
    if (!location) {
        showErrorMessage("Please enter a location to search.")
        return
    }

    // Simulate location search
    currentLocation = location
    showSuccessMessage(`Searching for charging stations near "${location}"...`)

    // In a real app, this would use a geocoding API
    setTimeout(() => {
        loadStations()
        showSuccessMessage(`Found ${filteredStations.length} charging stations near "${location}"`)
    }, 1000)
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        showSuccessMessage("Getting your current location...")

        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                }
                showSuccessMessage("Location found! Loading nearby charging stations...")
                loadStations()
            },
            (error) => {
                showErrorMessage("Unable to get your location. Please enter an address manually.")
            },
        )
    } else {
        showErrorMessage("Geolocation is not supported by your browser.")
    }
}

function applyStationFilters() {
    const speedFilters = Array.from(
        document.querySelectorAll('input[value="Level 1"], input[value="Level 2"], input[value="DC Fast"]:checked'),
    ).map((cb) => cb.value)
    const networkFilters = Array.from(
        document.querySelectorAll(
            'input[value="Tesla"], input[value="ChargePoint"], input[value="Electrify America"], input[value="EVgo"]:checked',
        ),
    ).map((cb) => cb.value)
    const availabilityFilters = Array.from(
        document.querySelectorAll('input[value="available"], input[value="occupied"]:checked'),
    ).map((cb) => cb.value)

    filteredStations = chargingStations.filter((station) => {
        // Speed filter
        if (speedFilters.length > 0 && !speedFilters.includes(station.type)) {
            return false
        }

        // Network filter
        if (networkFilters.length > 0 && !networkFilters.includes(station.network)) {
            return false
        }

        // Availability filter
        if (availabilityFilters.length > 0) {
            if (availabilityFilters.includes("available") && station.available === 0) {
                return false
            }
            if (!availabilityFilters.includes("occupied") && station.available === 0) {
                return false
            }
        }

        return true
    })

    loadStations()
}

function sortStations() {
    const sortBy = document.getElementById("stationSort").value

    switch (sortBy) {
        case "distance":
            // In a real app, this would sort by actual distance
            filteredStations.sort((a, b) => Number.parseFloat(a.distance) - Number.parseFloat(b.distance))
            break
        case "availability":
            filteredStations.sort((a, b) => b.available - a.available)
            break
        case "speed":
            filteredStations.sort((a, b) => {
                const powerA = Number.parseInt(a.power)
                const powerB = Number.parseInt(b.power)
                return powerB - powerA
            })
            break
        case "price":
            filteredStations.sort((a, b) => {
                const priceA = Number.parseFloat(a.price.replace("$", ""))
                const priceB = Number.parseFloat(b.price.replace("$", ""))
                return priceA - priceB
            })
            break
    }

    loadStations()
}

function loadStations() {
    const stationsGrid = document.getElementById("stationsGrid")
    if (!stationsGrid) return

    if (filteredStations.length === 0) {
        stationsGrid.innerHTML = `
      <div class="no-stations">
        <i class="fas fa-search"></i>
        <h3>No charging stations found</h3>
        <p>Try adjusting your filters or search in a different location.</p>
      </div>
    `
        return
    }

    stationsGrid.innerHTML = filteredStations.map((station) => createStationCard(station)).join("")
}

function createStationCard(station) {
    const statusClass = station.status === "available" ? "available" : "occupied"

    return `
    <div class="station-card" onclick="selectStation(${station.id})">
      <div class="station-header">
        <div>
          <div class="station-name">${station.name}</div>
          <div class="station-address">${station.address}</div>
        </div>
        <div class="station-status ${statusClass}">
          ${station.status === "available" ? "Available" : "Occupied"}
        </div>
      </div>
      <div class="station-info">
        <div><i class="fas fa-bolt"></i> ${station.power} ${station.type}</div>
        <div><i class="fas fa-map-marker-alt"></i> ${station.distance}</div>
        <div><i class="fas fa-charging-station"></i> ${station.available}/${station.total} available</div>
        <div><i class="fas fa-dollar-sign"></i> ${station.price}</div>
      </div>
    </div>
  `
}

function selectStation(stationId) {
    const station = chargingStations.find((s) => s.id === stationId)
    if (!station) return

    // Show station details
    alert(
        `${station.name}\n\nAddress: ${station.address}\nNetwork: ${station.network}\nType: ${station.type}\nPower: ${station.power}\nAvailable: ${station.available}/${station.total} ports\nPrice: ${station.price}\nDistance: ${station.distance}\n\nWould you like to get directions to this station?`,
    )
}

function showErrorMessage(message) {
    alert(message)
}

function showSuccessMessage(message) {
    alert(message)
}

// Add CSS for charging stations
const chargingStyle = document.createElement("style")
chargingStyle.textContent = `
  .no-stations {
    text-align: center;
    padding: 40px 20px;
    color: #718096;
  }

  .no-stations i {
    font-size: 48px;
    margin-bottom: 16px;
    color: #a0aec0;
  }

  .no-stations h3 {
    font-size: 20px;
    font-weight: 600;
    color: #4a5568;
    margin-bottom: 8px;
  }

  .station-info {
    font-size: 12px;
  }

  .station-info i {
    color: #667eea;
    width: 12px;
    margin-right: 4px;
  }
`
document.head.appendChild(chargingStyle)