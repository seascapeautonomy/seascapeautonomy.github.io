// Initialize map
const map = L.map('map').setView([-30, 140], 4);

// Add basemap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Load deployment data
fetch('data/deployments.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(site => {

            const marker = L.marker([site.lat, site.lon]).addTo(map);

            const popupContent = `
                <div class="popup-title">${site.name}</div>
                <div>${site.summary}</div>
                <a class="popup-link" href="${site.link}">View Details →</a>
            `;

            marker.bindPopup(popupContent);
        });
    })
    .catch(err => console.error("Error loading deployment data:", err));

