// DOM Elements
const views = {
    start: document.getElementById('start-screen'),
    loading: document.getElementById('loading-screen'),
    results: document.getElementById('results-screen'),
    error: document.getElementById('error-screen')
};

const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const retryBtn = document.getElementById('retry-btn');
const triviaContainer = document.getElementById('trivia-container');
const errorMessage = document.getElementById('error-message');

// State
let currentLat = null;
let currentLng = null;

// Initialization
function init() {
    // Clear out any obsolete local storage keys if they exist from previous versions
    localStorage.removeItem('mapsApiKey');
    localStorage.removeItem('geminiApiKey');

    // Event Listeners
    startBtn.addEventListener('click', handleStart);
    restartBtn.addEventListener('click', () => switchView('start'));
    retryBtn.addEventListener('click', () => switchView('start'));
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

function showError(msg) {
    errorMessage.textContent = msg;
    switchView('error');
}

function handleStart() {
    startGeolocationFlow();
}

// 1. Geolocation Flow
function startGeolocationFlow() {
    switchView('loading');
    
    if (!navigator.geolocation) {
        showError("Geolocation is not supported by your browser");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLat = position.coords.latitude;
            currentLng = position.coords.longitude;
            // Now fetch everything from our secure backend
            fetchTrivia(currentLat, currentLng);
        },
        (error) => {
            let errorMsg = "Unable to retrieve your location.";
            if (error.code === error.PERMISSION_DENIED) {
                errorMsg = "Location access was denied. Please allow it to use this app.";
            }
            showError(errorMsg);
        },
        { timeout: 10000 }
    );
}

// 2. Fetch Locations and Trivia from Secure Cloud Function
async function fetchTrivia(lat, lng) {
    document.getElementById('loading-text').textContent = "Discovering the world around you...";
    
    try {
        const res = await fetch('/getTrivia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng })
        });

        if (!res.ok) {
            throw new Error(`Cloud Function Error: ${res.status}`);
        }

        const json = await res.json();
        
        if (!json.data || !Array.isArray(json.data)) {
            throw new Error('Invalid response format from server');
        }

        renderResults(json);

    } catch (err) {
        console.error(err);
        showError("Failed to fetch data securely. Is the backend deployed?");
    }
}

// 3. Render the UI
function renderResults(response) {
    triviaContainer.innerHTML = '';
    
    // 3a. Render Location
    const loc = response.location;
    if (loc) {
        document.getElementById('user-location-name').textContent = loc.name;
        document.getElementById('user-location-coords').textContent = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
        document.getElementById('user-location-display').style.display = 'block';
    } else {
        document.getElementById('user-location-display').style.display = 'none';
    }

    // 3b. Render Trivia Cards
    response.data.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'trivia-card';
        
        card.innerHTML = `
            <div class="poi-name">${item.placeName}</div>
            <div class="poi-type">${item.placeType}</div>
            <div class="trivia-fact">${item.fact}</div>
        `;
        
        triviaContainer.appendChild(card);
    });
    
    switchView('results');
}

// Start app
init();
