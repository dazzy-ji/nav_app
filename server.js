require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { type } = require('os');
const { count, error } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.HOSTNAME || 'Local-Machine';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => res.status(204).end());

const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const guideCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const users = {};

const region_queries = {
    Africa: ['Nairobi', 'Kigali', 'Kampala', 'Accra', 'Lagos', 'Cape Town'],
    Europe: ['Paris', 'Berlin', 'London', 'Madrid', 'Rome', 'Amsterdam'],
    Asia: ['Tokyo', 'New Dehli', 'Seoul', 'Kuala Lumpur', 'Bangkok', 'Singapore'],
    Americas: ['Toronto', 'Sao Paulo', 'New York', 'Mexico City', 'Buenos Aires', 'Santiago'],
    Oceania: ['Sydney', 'Auckland', 'Suva', 'Port Moresby']
};

function isValidEmail(email){
    return typeof email === 'string' && email_regex.test(email.trim().toLocaleLowerCase());
}

function buildTravelNote(tempC, windKmh) {
    const notes = [];
    if (typeof tempC === 'number' && !Number.isNaN(tempC)) {
        if (tempC >= 30) notes.push("Hot Climate - pack light clothing. Carry your Sunscreen! 😎 ");
        else if (tempC <= 10) notes.push("Cool Climate - bring warm clothing. It may get chilly! 🥶");
        else notes.push('Pleasant temperatures - good for travel & outdoor activities. Enjoy your stay! 👌');
    }
    if (typeof windKmh === 'number' && !Number.isNaN(windKmh) && windKmh >= 25) {
        notes.push('noticable winds');
    }
    return notes.length ? notes.join('; ') : 'Check local forecast & entry rules before departure'
}

function formatPlace(raw={}, fallbackQuery = ''){
    const name = 
        typeof raw.name === 'string' && raw.name.trim()
            ? raw.name.trim()
            : fallbackQuery || 'Destination';

    const country =
        typeof raw.country === 'string' && raw.country.trim()
            ? raw.country.trim()
            : 'Global';

    const adminArea = 
        typeof raw.admin1 === 'string' && raw.admin1.trim()
            ? raw.admin1.trim()
            : country;

    const countryCode =
        typeof raw.country_code === 'string' ? raw.country_code.trim().toLowerCase() : '';

    const flagUrl = countryCode ? `https://flagcdn.com/w320/${countryCode}.png` : '';

    const hasCoords =
        typeof raw.latitude === 'number' &&
        !Number.isNaN(raw.latitude) &&
        typeof raw.longitude === 'number' &&
        !Number.isNaN(raw.longitude);

    const numericElevation =
        typeof raw.elevation === 'number'
            ? raw.elevation
            : typeof raw.elevation === 'string' && raw.elevation.trim() !== ''
                ? Number(raw.elevation)
                : NaN;

    const tempC = 
        typeof raw.temperature_2m === 'number' && !Number.isNaN(raw.temperature_2m)
            ? raw.temperature_2m
            : undefined;

    const windKmh =
        typeof raw.wind_speed_10m === 'number' && !Number.isNaN(raw.wind_speed_10m)
            ? raw.wind_speed_10m
            : undefined;

    const safeId = raw.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const code = `${safeId}-${countryCode || 'loc'}`;

    return{
        code,
        name,
        country,
        adminArea,
        timezone: raw.timezone || 'UTC',
        elevation: !Number.isNaN(numericElevation) ? `${numericElevation} m` : 'N/A',
        coordinates: hasCoords
            ? `${raw.latitude.toFixed(2)}°, ${raw.longitude.toFixed(2)}°`
            : 'N/A',
        currentTemp : typeof tempC === 'number' ? `${tempC} °C` : 'N/A',
        windSpeed: typeof windKmh === 'number' ? `${windKmh} km/h` : 'N/A',
        travelAdvisory: buildTravelNote(tempC, windKmh),
        population: Number(raw.population) || 0,
        flag: flagUrl
    };
}

async function fetchCurrentWeather(latitude, longitude) {
    if (
        typeof latitude !== 'number' ||
        Number.isNaN(latitude) ||
        typeof longitude !== 'number' ||
        Number.isNaN(longitude)
    ) {
        return {};
    }

    try{
        const wxRes = await axios.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude,
                longitude,
                current: 'temperature_2m,wind_speed_10m'
            },
            timeout: 10000,
            family: 4
        });
        return wxRes.data?.current || {};
    } catch (err) {
        console.warn(`Weather lookup skipped (${latitude}, ${longitude}):`, err.code || err.message);
        return {};
    }
}

async function fetchDestination(queryName) {
    try {
        const geoRes = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
            params: { name: queryName, count: 1, language: 'en', format: 'json' },
            timeout: 10000,
            family: 4
        });

        const place =
            geoRes.data && Array.isArray(geoRes.data.results) ? geoRes.data.results[0] : null;
        if (!place) return null;

        const currentWx = await fetchCurrentWeather(place.latitude, place.longitude);
        return formatPlace({ ...place, ...currentWx }, queryName);
    } catch (err) {
        console.warn(`Lookup skipped for "${queryName}":`, err.code || err.message);
        return null;
    }
}

app.get('/api/health', (req, res) => {
    res.setHeader('X-Served-By', SERVER_NAME);
    return res.json({ status: 'ok', server: SERVER_NAME});
});

app.post('/api/login', (req, res) => {
    try {
        const email = (req.body?.email || '').trim().toLowerCase();
        const mode = req.body?.mode === 'signup' ? 'signup' : 'signin';

        if(!isValidEmail(email)) {
            return res.status(400).json({
                error: 'Please enter a valid email address (for example: travel@example.com.'
            });
        }

        if (!users[email]) {
            const handle = email.split('@')[0];
            const displayName = handle.charAt(0).toUpperCase() + handle.slice(1);
            users[email] = {
                name: displayName,
                preferredRegion: 'Africa',
                savedPlaces: []
            };
        }

        res.setHeader('X-Served-By', SERVER_NAME);
        return res.json({ user: users[email], email, mode });
    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ error: 'Unable to sign in right now.'});
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const email = (req.body?.email || '').trim().toLowerCase();
        const preferredRegion = req.body?.preferredRegion;

        if (!email || !users[email]) {
            return res.status(404).json({ error: 'Please sign in first to save settings.' });
        }

        users[email].preferredRegion = preferredRegion || 'Africa';
        res.setHeader('X-Served-By', SERVER_NAME);
        return res.json({ preferredRegion: users[email].preferredRegion, user: users[email] });
    } catch (err){
        console.error('Settings error:', err.message);
        return res.status(500).json({ error: 'Unable to save settings right now.'});
    }
});

app.get('/api/saved', (req, res) => {
    const email = (req.query?.email || '').trim().toLowerCase();
    if (!email || !users[email]) {
        return res.status(404).json({ error: 'User account not found,' });
    }
    res.setHeader('X-Served-By', SERVER_NAME);
    return res.json({ savedPlaces: users[email].savedPlaces || [] });
});

app.post('/api/saved', (req, res) => {
    try{
        const email = (req.body?.email || '').trim().toLowerCase();
        const place = req.body?.place;

        if(!email || !users[email]) {
            return res.status(404).json({ error: 'Sign in first to save destinations.' });
        }

        if(!place || !place.name){
            return res.status(404).json({ error: 'Destination details are missing.'});
        }

        const normalizedPlace = {
            ...place,
            code: place.code || place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            country: place.country || place.adminArea || 'Global'
        };

        users[email].savedPlaces = (users[email].savedPlaces || []).filter(
            (p) => p.code !== normalizedPlace.code
        );
        users[email].savedPlaces.unshift(normalizedPlace);

        res.setHeader('X-Served-By', SERVER_NAME);
        return res.json({ savedPlaces: users[email].savedPlaces });
    } catch (err) {
        console.error('Save error:', err.message);
        return res.status(500).json({ error: 'Unable to save destination right now.' });
    }
});

app.delete('/api/saved', (req, res) => {
    try {
        const email = (req.query?.email || '').trim().toLowerCase();
        const code = decodeURIComponent(req.query?.code || '');

        if (!email || !users[email]) {
            return res.status(404).json({ error: 'User account not found '});
        }

        users[email].savedPlaces = (users[email].savedPlaces || []).filter((p) => p.code !== code);
        res.setHeader('X-Served-By', SERVER_NAME);
        return res.json({ savedPlaces: users[email].savedPlaces });
    } catch (err) {
        console.error('Delete saved error:', err.message);
        return res.status(500).json({ error: 'Unable to remove saved dstination.'});
    }
});

app.get('/api/guide', async (req, res) => {
    const region = (req.query?.region || 'Africa').trim();
    const search = (req.query?.search || '').trim();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Served-By', SERVER_NAME);

    const cacheKey = search ? `search:${search.toLowerCase()}` : `region:${region.toLowerCase()}`;
    const cached = guideCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    try {
        let formatted = [];

        if (search) {
            const geoRes = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
                params: { name: search, count: 6, language: 'en', format: 'json'},
                timeout: 12000,
                family: 4
            });
            const results = Array.isArray(geoRes.data?.results) ? geoRes.data.results : [];
            if (results.length === 0){
                return res.status(404).json({ error: `No destination found matching "${search}".`});
            }

            for (const item of results) {
                const currentWx = await fetchCurrentWeather(item.latitude, item.longitude);
                formatted.push(formatPlace({ ...item, ...currentWx }, search));
            }
        } else {
            const targets = region_queries[region] || region_queries.Africa;
            for (const name of targets) {
                const entry = await fetchDestination(name);
                if (entry) formatted.push(entry);
            }
        }

        if (formatted.length === 0){
            return res.status(502).json({
                error: 'Live travel API is temporarily unreachable. Please try again.'
            });
        }

        guideCache.set(cacheKey, { savedAt: Date.now(), data: formatted });
        res.setHeader('X-Cache','MISS');
        return res.json(formatted);
    } catch (err){
        console.error('Guide API error:', err.code || '', err.response?.status || '', err.message);
        return res.status(502).json({
            error: 'Unable to load destination info right now. Please try again.'
        });
    }
});

app.use('/api', (req, res) => {
    res.setHeader('X-Served-By', SERVER_NAME);
    return res.status(404).json({
        error: `API route not found: ${req.method} ${req.originalUrl}`
    });
});

app.listen(PORT, () => {
    console.log(`Tuende Guide (${SERVER_NAME}) running at http://localhost:${PORT}`);
})