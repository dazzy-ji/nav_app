const email_pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let currentEmail = null;
let currentUser = null;
let currentPlaces = [];

function getEl(id){
    return document.getElementById(id);
}

function getTrimmedValue(el){
    return el && typeof el.value === 'string' ? el.value.trim() : '';
}

const emailInput = getEl('emailInput');
const loginBtn = getEl('loginBtn');
const logoutBtn = getEl('logoutBtn');
const loggedOutView = getEl('loggedOutView');
const loggedInView = getEl('loggedInView');
const appContent = getEl('appContent');
const userName = getEl('userName');
const userPill = getEl('userPill');
const serverPill = getEl('serverPill');
const prefRegionSelect = getEl('prefRegionSelect');
const searchInput = getEl('searchInput');
const searchBtn = getEl('searchBtn');
const regionSelect = getEl('regionSelect');
const sortSelect = getEl('sortSelect');
const statusNote = getEl('statusNote');
const errorBox = getEl('errorBox');
const savedSection = getEl('savedSection');
const savedCount = getEl('savedCount');
const savedList = getEl('savedList');
const guideGrid = getEl('guideGrid');

function showError(msg){
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
}

function clearError(){
    if(!errorBox) return;
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
}

function showAppContent(){
    const signedIn = Boolean(currentEmail && currentUser);

    if(signedIn){
        if(loggedOutView) loggedOutView.classList.add('hidden');
        if(loggedInView) loggedInView.classList.remove('hidden');
        if(appContent) appContent.classList.remove('hidden');
        if(savedSection) savedSection.classList.remove('hidden');
    } else {
        if(loggedInView) loggedInView.classList.add('hidden');
        if(loggedOutView) loggedOutView.classList.remove('hidden');
        if(appContent) appContent.classList.add('hidden');
        if(savedSection) savedCount.classList.add('hidden');
        currentPlaces = [];
        if(guideGrid) guideGrid.innerHTML = '';
        if(statusNote) statusNote.textContent = 'Sign in to explore live destinations';
    }
}

async function pasreJsonSafely(res) {
    const rawText = await res.text();
    try{
        return JSON.parse(rawText);
    } catch {
        throw new Error(`Unexpected serever response (HTTP ${res.status}).`);
    }
}

if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        clearError();
        const email = getTrimmedValue(emailInput).toLowerCase();

        if(!email_pattern.test(email)) {
            return showError('Please enter a valid email address (for example traveler@example.com)');
        }

        try{
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await pasreJsonSafely(res);

            if(!res.ok){
                return showError(data.error || 'Could not sign in.');
            }

            currentEmail = data.email;
            currentUser = data.user;

            if (userName) userName.textContent = currentUser.name;
            if (userPill) userPill.textContent = currentUser.name;

            const region = currentUser. preferredRegion || 'Africa';
            if (prefRegionSelect) prefRegionSelect.value = region;
            if (regionSelect) regionSelect.value = region;

            showAppContent();
            renderSavedPlaces();
            await loadGuide({ region });
        } catch (err) {
            showError(err.message || 'Could not connect to the server.');
        }
    });
}

if(emailInput){
    emailInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
            e.preventDefault();
            loginBtn?.click();
        }
    });
}

if(logoutBtn){
    logoutBtn.addEventListener('click', () => {
        clearError();
        currentEmail = null;
        currentUser = null;
        if(userPill) userPill.textContent = 'Guest';
        showAppContent();
    });
}

if(prefRegionSelect){
    prefRegionSelect.addEventListener('change', async () => {
        if (!currentEmail) return;
        clearError();

        const selectedRegion = prefRegionSelect.value || 'Africa';
        if (regionSelect) regionSelect.value = selectedRegion;

        try{
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, prefRegionSelect: selectedRegion })
            });
        } catch {}

        await loadGuide({ region: selectedRegion });
    });
}

if(searchBtn){
    searchBtn.addEventListener('click', async () => {
        if(!currentEmail){
            return showError('Please sign in first to search for destinations.');
        }
        const query = getTrimmedValue(searchInput);
        if (!query){
            return loadGuide({ region: regionSelect ? regionSelect.value: 'Africa' })
        }
        await loadGuide({ search: query });
    });
}

if (searchInput){
    searchInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
            e.preventDefault();
            searchBtn?.click();
        }
    });
}

if(regionSelect){
    regionSelect.addEventListener('change', async() => {
        if(!currentEmail) return;
        if(searchInput) searchInput.value = '';
        await loadGuide({ region: regionSelect.value });
    });
}

if(sortSelect){
    sortSelect.addEventListener('change', renderPlaces);
}

async function loadGuide({ region, search } ={}){
    if(!currentEmail)return;
    clearError();
    if(statusNote) statusNote.textContent = 'Fetching live destinations & weather data...';

    const activeRegion = region || (regionSelect ? regionSelect.value : 'Africa') || 'Africa';

    try{
        const query = search
            ? `search=${encodeURIComponent(search)}`
            : `region=${encodeURIComponent(activeRegion)}`;
        
            const res = await fetch(`/api/guide?${query}`);
            const data = await pasreJsonSafely(res);

            if(!res.ok){
                currentPlaces = [];
                renderPlaces();
                if(statusNote)statusNote.textContent = '0 destinations shown';
                return showError(data.error || 'Could not load destination info.');
            }

            currentPlaces = Array.isArray(data) ? data : [];
            const cacheStatus = res.headers.get('X-Cache') || 'MISS';
            const servedBy = res.headers.get('X-Served-By');

            if(statusNote){
                statusNote.textContent = `${currentPlaces.length} destination(s) | ${cacheStatus === 'HIT' ? 'Cached response (fast)' : 'Live Open-Meteo API'}`;
            }
            if(servedBy && serverPill) serverPill.textContent = `Server: ${servedBy}`;

            renderPlaces();
    } catch (err){
        if(statusNote) statusNote.textContent = '0 destinations shown';
        showError(err.message || 'Network error wholeloading destination info.');
    }
}

function isPlaceSaved(place){
    if(!currentUser || !Array.isArray(currentUser.savedPlaces)) return false;
    return currentUser.savedPlaces.some(
        (item) => (place.code && item.code === place.code) || item.name === place.name
    );
}

function renderPlaces(){
    if(!guideGrid) return;
    const sortBy = sortSelect ? sortSelect.value : 'name-asc';
    const list = [...currentPlaces];

    if (sortBy === 'name-asc'){
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'pop-desc'){
        list.sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));
    } else if (sortBy === 'pop-asc'){
        list.sort((a, b) => (Number(a.population) || 0) - (Number(b.population) || 0));
    }

    guideGrid.innerHTML = '';

    list.forEach((place) => {
        const card = document.createElement('article');
        card.className = 'place-card';

        const popDisplay =
            Number(place.population) > 0 ? Number(place.population).toLocaleString() : 'N/A';

        const safeCountry = place.country || place.adminArea ||'Global';
        const safeRegion = place.adminArea || safeCountry;
        const safeTimezone = place.timezone || 'UTC';
        const safeElevation = place.elevation || 'N/A';
        const safeCoords = place.coordinates || 'N/A';
        const safeTemp = place.currentTemp || 'N/A';
        const safeWind = place.windSpeed || 'N/A';
        const safeTip = place.travelAdvisory || 'Check local forecasts & entry rules before departure';

        card.innerHTML = `
            <div class="place-body">
                ${
                    place.flag
                        ? `<img class="flag-img" src="${place.flag}" alt="Flag of ${safeCountry}" onerror="this.style.display='none'" />`
                        : `<div class="flag-placeholder">${safeCountry}</div>`
                }
                <div class="place-heading">
                    <h3>${place.name}</h3>
                    <span class="badge">${safeCountry}</span>
                </div>
                <dl class="meta-grid">
                    <div><dt>Region / State</dt><dd>${safeRegion}</dd></div>
                    <div><dt>Timezone</dt><dd>${safeTimezone}</dd></div>
                    <div><dt>Current Temp</dt><dd>${safeTemp}</dd></div>
                    <div><dt>Wind</dt><dd>${safeWind}</dd></div>
                    <div><dt>Elevation</dt><dd>${safeElevation}</dd></div>
                    <div><dt>Population</dt><dd>${popDisplay}</dd></div>
                    <div class="span-2"><dt>Coordinates</dt><dd>${safeCoords}</dd></div>
                </dl>
                <p class ="advisory-note"><strong>Travel Note:</strong> ${safeTip}</p>
            </div>
        `;

        if(currentEmail){
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn btn-save';
            saveBtn.textContent = isPlaceSaved(place) ? 'Saved ✓' : 'Save Destination';

            saveBtn.onclick = async () => {
                clearError();
                try{
                    const res = await fetch('/api/saved', {
                        method: 'POST',
                        headers: { 'Content-Type' : 'application/json'},
                        body: JSON.stringify({
                            email: currentEmail,
                            place: { ...place, country: safeCountry }
                        })
                    });
                    const data = await pasreJsonSafely(res);
                    if(!res.ok){
                        return showError(data.error || 'Could not save destination.');
                    }
                    if (currentUser){
                        currentUser.savedPlaces = Array.isArray(data.savedPlaces)
                            ? data.savedPlaces
                            : Array.isArray(data.user?.savedPlaces)
                                ? data.user.savedPlaces
                                : [];
                        renderSavedPlaces();
                        renderPlaces();
                    }
                } catch (err) {
                    showError(err.message || 'Unable to save destination.');
                }
            };
            card.appendChild(saveBtn);
        }

        guideGrid.appendChild(card);
    });
}

function renderSavedPlaces(){
    if(!currentUser || !savedList) return;
    const items = Array.isArray(currentUser.savedPlaces) ? currentUser.savedPlaces : [];
    if (savedCount) savedCount.textContent = `${items.length} saved`;
    savedList.innerHTML = '';

    if(items.length === 0){
        savedList.innerHTML = '<span class="muted">No saved destinations yet.</span>';
        return;
    }

    items.forEach((place, idx) => {
        const chip = document.createElement('div');
        chip.className = 'saved-chip';

        const labelCountry = place.country || place.adminArea || 'Global';
        const targetCode = place.code || `${place.name}-${idx}`;

        chip.innerHTML = `<span><strong>${place.name}</strong> - ${labelCountry} (${place.currentTemp || 'N/A'})</span>`;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'remove-btn';
        delBtn.textContent = 'x';
        delBtn.title = 'Remove destination';
        delBtn.onclick = async () => {
            clearError();
            try{
                const url = `/api/saved?email=${encodeURIComponent(currentEmail)}&code=${encodeURIComponent(targetCode)}`;
                const res = await fetch(url, { method: 'DELETE' });
                const data = await pasreJsonSafely(res);
                if(!res.ok){
                    return showError(data.error || 'Could not remove destination.');
                }
                currentUser.savedPlaces = Array.isArray(data.savedPlaces) ? data.savedPlaces : [];
                renderSavedPlaces();
                renderPlaces();
            } catch (err){
                showError(err.message || 'Unable to remove saved destination.');
            }
        };

        chip.appendChild(delBtn);
        savedList.appendChild(chip);
    });
}

showAppContent();