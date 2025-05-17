// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Check that Mapbox GL JS is loaded
console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiY2F0MDE3dWNzZCIsImEiOiJjbWFyOWdtZzAwN3ljMm5vdHByYnNzM3o5In0.jD5q6AozmlKze4CiYfldbg';

let map;
let circles;
let jsonData;
let trips;
let stations;
let radiusScale;
let stationFlow;

const map_style = 'mapbox://styles/cat017ucsd/cmarbna0401g501spg9f7a09k';
const initial_zoom = 12;
const min_zoom = 5;
const max_zoom = 18;

const cityConfigs = {
    'Boston': {
        center: [-71.09415, 42.36027],
        jsonDataUrl: "https://dsc106.com/labs/lab07/data/bluebikes-stations.json",
        tripsUrl: "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv",
        routes: [
            {
                id: 'boston_route',
                url: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
                layerId: 'bike-lanes-boston'
            },
            {
                id: 'cambridge_route',
                url: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
                layerId: 'bike-lanes-cambridge'
            }
        ]
    },
    'Chicago': {
        center: [-87.60039530235866, 41.79060835668532],
        jsonDataUrl: "https://gbfs.lyft.com/gbfs/2.3/chi/en/station_information.json",
        tripsUrl: "assets/divvy_subset.csv",
        routes: [
            {
                id: 'chicago_route',
                url: 'https://data.cityofchicago.org/resource/hvv9-38ut.geojson',
                layerId: 'bike-lanes-chicago'
            }
        ]
    }
};

// Initialize city from dropdown or use default
let currentCity = 'Chicago';

// Initialize map with current city
function initializeMap(city) {
    if (map) {
        map.remove(); // Remove existing map if any
    }

    // Get city configuration
    const config = cityConfigs[city];
    
    // Create new map
    map = new mapboxgl.Map({
        container: 'map',
        style: map_style,
        center: config.center,
        zoom: initial_zoom,
        minZoom: min_zoom,
        maxZoom: max_zoom,
    });

    // Set up map event handlers and load data when map is ready
    map.on('load', async () => {
        await loadCityData(city);
    });
}

// Load data for the selected city
async function loadCityData(city) {
    const config = cityConfigs[city];
    
    // Add bike route layers
    for (const route of config.routes) {
        map.addSource(route.id, {
            type: 'geojson',
            data: route.url,
        });
        
        map.addLayer({
            id: route.layerId,
            type: 'line',
            source: route.id,
            paint: {
                'line-color': 'green',
                'line-width': 3,
                'line-opacity': 0.6,
            },
        });
    }

    // Load station and trip data
    jsonData = await d3.json(config.jsonDataUrl);
    trips = await d3.csv(
        config.tripsUrl,
        (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        },
    );

    // Process stations data
    stations = computeStationTraffic(jsonData.data.stations, trips);

    // Set up visualization
    setupVisualization();
}

// Set up the station visualization
function setupVisualization() {
    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }
    
    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx)
            .attr('cy', (d) => getCoords(d).cy);
    }
    
    // Set up scales
    radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);
    
    stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    // Clear existing SVG content
    const svg = d3.select('#map').select('svg');
    svg.selectAll('*').remove();
    
    // Add station circles
    circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .each(function (d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        })
        .style('--departure-ratio', (d) =>
            stationFlow(d.departures / d.totalTraffic),
        );

    // Update circle positions
    updatePositions();
    
    // Set up map event handlers
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    // Set up time filtering
    setupTimeFilter();
}

// Set up time filtering functionality
function setupTimeFilter() {
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');
    
    function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.textContent = '';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }

        updateScatterPlot(timeFilter);
    }
    
    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);
        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
        
        circles
            .data(filteredStations, (d) => d.short_name)
            .join('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .style('--departure-ratio', (d) =>
                stationFlow(d.departures / d.totalTraffic),
            );
    }
    
    // Set up event listener for time slider
    timeSlider.addEventListener('input', updateTimeDisplay);
    
    // Initialize time display
    updateTimeDisplay();
}

// Format time for display
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Compute traffic statistics for each station
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    );

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

// Calculate minutes since midnight for time filtering
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

// Filter trips by time
function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);

            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

// Initialize with the default city
document.addEventListener('DOMContentLoaded', () => {
    // Set up city selector dropdown
    const citySelector = document.getElementById('city-selector');
    
    // Initialize dropdown to current city
    citySelector.value = currentCity;
    
    // Add event listener for city change
    citySelector.addEventListener('change', () => {
        currentCity = citySelector.value;
        initializeMap(currentCity);
    });
    
    // Initialize map with default city
    initializeMap(currentCity);
});