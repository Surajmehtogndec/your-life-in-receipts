/**
 * @fileoverview Main logic for Your Life In Receipts.
 * Handles data fetching, normalization, and UI rendering.
 */

const CONFIG = {
    ITEMS_PER_PAGE: 60,
    MAX_TIME_GAP_MS: 3 * 60 * 60 * 1000
};

let state = {
    masterTimeline: [],
    filteredTimeline: [],
    currentlyDisplayed: 0,
    currentFilter: 'all',
    searchQuery: ''
};

/**
 * Sanitizes input to prevent XSS attacks.
 * @param {string} str - Raw string
 * @returns {string} Sanitized string
 */
const escapeHTML = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

/**
 * Standardizes disparate date formats.
 * @param {string} dateStr - Raw date string
 * @param {string} source - Dataset origin
 * @returns {number} Epoch timestamp
 */
const parseDateSmart = (dateStr, source) => {
    if (!dateStr) return 0;
    dateStr = String(dateStr).trim();
    try {
        if (source === 'household' || source === 'purchase') {
            const parts = dateStr.split(/\s+/);
            const dateParts = parts[0].split(/[/-]/);
            if(dateParts.length === 3) {
                let time = parts[1] || '00:00:00';
                if (time.split(':').length === 2) time += ':00'; 
                const padTime = time.split(':').map(x => x.padStart(2, '0')).join(':');
                const isoStr = source === 'household' 
                    ? `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}T${padTime}`
                    : `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}T${padTime}`;
                return new Date(isoStr).getTime();
            }
        }
    } catch(e) {}
    const fallback = new Date(dateStr).getTime();
    return isNaN(fallback) ? 0 : fallback;
};

/**
 * Initializes the application and unifies datasets.
 */
async function initApp() {
    try {
        const fetchJson = async () => {
            try {
                const res = await fetch('Augmented_IndiaTransactMultiFacet2024.json');
                const data = await res.json();
                return data.map(item => ({
                    source: 'purchase',
                    timestamp: parseDateSmart(item.trans_date_trans_time || item.transaction_date || item.date || item.Date, 'purchase'), 
                    data: item
                }));
            } catch (e) { return []; }
        };

        const fetchCsv = async (url, sourceName) => {
            try {
                const res = await fetch(url);
                const text = await res.text();
                return new Promise(resolve => {
                    Papa.parse(text, {
                        header: true, skipEmptyLines: true,
                        complete: (results) => resolve(results.data.map(row => ({
                            source: sourceName,
                            timestamp: parseDateSmart(row.Date || row.ts || row.timestamp, sourceName),
                            data: row
                        }))),
                        error: () => resolve([])
                    });
                });
            } catch (e) { return []; }
        };

        const [json, spotify, household] = await Promise.all([
            fetchJson(),
            fetchCsv('spotify_history.csv', 'music'),
            fetchCsv('Daily Household Transactions.csv', 'household')
        ]);

        let rawTimeline = [...json, ...spotify, ...household].filter(i => i.timestamp > 0);
        rawTimeline.sort((a, b) => a.timestamp - b.timestamp);

        let storyId = 1;
        let lastTs = rawTimeline[0]?.timestamp || 0;
        
        rawTimeline.forEach(item => {
            if (item.timestamp - lastTs > CONFIG.MAX_TIME_GAP_MS) storyId++;
            item.storyId = `story-${storyId}`;
            lastTs = item.timestamp;
        });

        // Fisher-Yates Shuffle
        for (let i = rawTimeline.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rawTimeline[i], rawTimeline[j]] = [rawTimeline[j], rawTimeline[i]];
        }

        state.masterTimeline = rawTimeline;
        state.filteredTimeline = [...rawTimeline];
        
        document.getElementById('loading-spinner').style.display = 'none';
        renderCards(true);

    } catch (error) {
        document.getElementById('scrapbook-canvas').innerHTML = `<div class="alert alert-danger">Engine Load Failure</div>`;
    }
}

/**
 * Renders memory cards to the DOM using DocumentFragments.
 * @param {boolean} reset - Whether to clear the canvas first
 */
function renderCards(reset = false) {
    const canvas = document.getElementById('scrapbook-canvas');
    if (!canvas) return;

    if (reset) {
        state.currentlyDisplayed = 0;
        canvas.innerHTML = '';
        const searchLower = state.searchQuery.toLowerCase();
        state.filteredTimeline = state.masterTimeline.filter(item => {
            const srcMatch = state.currentFilter === 'all' || item.source === state.currentFilter;
            const textMatch = Object.values(item.data).some(v => String(v).toLowerCase().includes(searchLower));
            return srcMatch && textMatch;
        });
    }

    if (state.filteredTimeline.length === 0) {
        canvas.innerHTML = `<div class="w-100 text-center text-muted">No memories found.</div>`;
        document.getElementById('load-more-container').style.display = 'none';
        return;
    }

    const chunk = state.filteredTimeline.slice(state.currentlyDisplayed, state.currentlyDisplayed + CONFIG.ITEMS_PER_PAGE);
    const fragment = document.createDocumentFragment();

    chunk.forEach(item => {
        const wrapper = document.createElement('div');
        const rot = window.innerWidth > 768 ? (Math.random() * 12) - 6 : 0;
        
        const dateObj = new Date(item.timestamp);
        const sDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const sTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        let html = '', aria = '';
        const storyAttr = escapeHTML(item.storyId);

        if (item.source === 'purchase') {
            const m = escapeHTML(item.data.merchant || 'Store');
            const a = escapeHTML(item.data.amt || item.data.amount || '0');
            const c = escapeHTML(item.data.category || 'General');
            aria = `Purchase at ${m} for ${a}`;
            html = `<article class="memory-card style-receipt" data-story="${storyAttr}" style="transform: rotate(${rot}deg);" role="button" tabindex="0" aria-label="${aria}"><div class="receipt-header">${m.substring(0,20)}</div><div class="item-row"><span>Date</span><span>${sDate}</span></div><div class="item-row"><span>Type</span><span>${c}</span></div><div class="total-row"><span>TOTAL</span><span>₹${a}</span></div></article>`;
        } else if (item.source === 'household') {
            const n = escapeHTML(item.data.Note || item.data.Subcategory || 'Note');
            aria = `Note: ${n}`;
            html = `<article class="memory-card style-sticky" data-story="${storyAttr}" style="transform: rotate(${rot}deg);" role="button" tabindex="0" aria-label="${aria}">"${n}"</article>`;
        } else {
            const t = escapeHTML(item.data.track_name || 'Track');
            const art = escapeHTML(item.data.artist_name || 'Artist');
            aria = `Listened to ${t}`;
            html = `<article class="memory-card style-music" data-story="${storyAttr}" style="transform: rotate(${rot}deg);" role="button" tabindex="0" aria-label="${aria}"><div class="music-icon" aria-hidden="true">🎵</div><div class="music-details"><span class="music-title">${t}</span><span class="music-artist">${art}</span><span class="music-time">🕒 ${sTime}</span></div></article>`;
        }

        wrapper.innerHTML = html;
        const el = wrapper.firstElementChild;

        const toggle = (e) => {
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
            if (e.type === 'keydown') e.preventDefault();
            const sid = el.getAttribute('data-story');
            const isHigh = el.classList.contains('highlighted');
            document.querySelectorAll('.memory-card').forEach(card => {
                if (isHigh) {
                    card.classList.remove('dimmed', 'highlighted');
                    card.setAttribute('aria-expanded', 'false');
                } else {
                    if (card.getAttribute('data-story') === sid) {
                        card.classList.remove('dimmed'); card.classList.add('highlighted');
                        card.setAttribute('aria-expanded', 'true');
                    } else {
                        card.classList.remove('highlighted'); card.classList.add('dimmed');
                        card.setAttribute('aria-expanded', 'false');
                    }
                }
            });
        };

        el.addEventListener('click', toggle);
        el.addEventListener('keydown', toggle);
        fragment.appendChild(el);
    });

    canvas.appendChild(fragment);
    state.currentlyDisplayed += CONFIG.ITEMS_PER_PAGE;
    
    const btn = document.getElementById('load-more-container');
    if (btn) btn.style.display = state.currentlyDisplayed >= state.filteredTimeline.length ? 'none' : 'block';
}

// Event Listeners
document.getElementById('load-more-btn').addEventListener('click', () => renderCards(false));

let debounce;
document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.searchQuery = e.target.value; renderCards(true); }, 300);
});

document.getElementById('filter-buttons').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        e.target.classList.add('active'); e.target.setAttribute('aria-pressed', 'true');
        state.currentFilter = e.target.getAttribute('data-filter');
        renderCards(true);
    }
});

document.addEventListener('DOMContentLoaded', initApp);