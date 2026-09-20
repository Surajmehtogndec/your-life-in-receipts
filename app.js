/**
 * @fileoverview Main application logic for "Your Life, In Receipts".
 *
 * Handles:
 * - Dataset loading
 * - Data normalization
 * - Search
 * - Filtering
 * - Story grouping
 * - Pagination
 * - Memory card rendering
 * - Accessibility states
 * - Error handling
 * - Performance optimization
 *
 * @version 2.0.0
 */


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIG = Object.freeze({

    ITEMS_PER_PAGE: 60,

    /*
     * Maximum time gap between two chronological events
     * before a new story is created.
     */
    MAX_TIME_GAP_MS: 3 * 60 * 60 * 1000,

    SEARCH_DEBOUNCE_MS: 300,

    DATE_LOCALE: 'en-US',

    MAX_MERCHANT_LENGTH: 20,

    MAX_RETRY_ATTEMPTS: 2

});


/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {

    masterTimeline: [],

    filteredTimeline: [],

    currentlyDisplayed: 0,

    currentFilter: 'all',

    searchQuery: '',

    isLoading: false,

    hasError: false,

    retryCount: 0

};


/* =========================================================
   DOM CACHE
========================================================= */

const DOM = {};


/**
 * Caches frequently accessed DOM elements.
 *
 * This reduces repeated document queries and improves
 * rendering performance.
 */
function cacheDOM() {

    DOM.canvas = document.getElementById('scrapbook-canvas');

    DOM.loadingSpinner =
        document.getElementById('loading-spinner');

    DOM.emptyState =
        document.getElementById('empty-state');

    DOM.errorState =
        document.getElementById('error-state');

    DOM.retryButton =
        document.getElementById('retry-btn');

    DOM.clearSearchButton =
        document.getElementById('clear-search-btn');

    DOM.resultStatus =
        document.getElementById('result-status');

    DOM.loadMoreContainer =
        document.getElementById('load-more-container');

    DOM.loadMoreButton =
        document.getElementById('load-more-btn');

    DOM.searchInput =
        document.getElementById('search-input');

    DOM.filterButtons =
        document.getElementById('filter-buttons');

}


function intelligentSearch(items, query) {
    const tokens = getSearchTokens(query);

    if (!tokens.length) {
        return items;
    }

    return items
        .map(item => ({
            item,
            score: calculateSearchScore(item, query, tokens)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 300)
        .map(result => result.item);
}

/* =========================================================
   SECURITY
========================================================= */


/**
 * Escapes potentially unsafe HTML characters.
 *
 * @param {*} value Raw value.
 * @returns {string} Safe HTML string.
 */
function escapeHTML(value) {

    if (value === null || value === undefined) {
        return '';
    }

    const div = document.createElement('div');

    div.textContent = String(value);

    return div.innerHTML;
}


/* =========================================================
   DATA HELPERS
========================================================= */


/**
 * Converts an arbitrary value to a safe string.
 *
 * @param {*} value Input value.
 * @param {string} fallback Fallback value.
 * @returns {string}
 */
function safeString(value, fallback = '') {

    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    return String(value).trim();
}


/**
 * Converts a value to a lowercase searchable string.
 *
 * @param {*} value Input value.
 * @returns {string}
 */
function normalizeSearchText(value) {

    return safeString(value)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
}


/**
 * Builds searchable text once during normalization.
 *
 * This avoids repeatedly calling Object.values()
 * and toLowerCase() for every search.
 *
 * @param {Object} data Dataset record.
 * @returns {string}
 */
function buildSearchText(data) {

    return Object.values(data)
        .map(value => normalizeSearchText(value))
        .filter(Boolean)
        .join(' ');
}


/**
 * Parses different dataset date formats.
 *
 * @param {string} dateStr Raw date.
 * @param {string} source Dataset origin.
 * @returns {number} Epoch timestamp.
 */
function parseDateSmart(dateStr, source) {

    if (!dateStr) {
        return 0;
    }

    const raw = String(dateStr).trim();

    try {

        /*
         * Household and purchase datasets may use
         * DD/MM/YYYY or MM/DD/YYYY formats.
         */
        if (
            source === 'household' ||
            source === 'purchase'
        ) {

            const parts = raw.split(/\s+/);

            const datePart = parts[0];

            const timePart = parts[1] || '00:00:00';

            const dateParts =
                datePart.split(/[/-]/);

            if (dateParts.length === 3) {

                let time = timePart;

                if (time.split(':').length === 2) {
                    time += ':00';
                }

                const paddedTime = time
                    .split(':')
                    .map(value =>
                        value.padStart(2, '0')
                    )
                    .join(':');


                let isoString;


                /*
                 * Household:
                 * DD/MM/YYYY
                 */
                if (source === 'household') {

                    isoString =
                        `${dateParts[2]}-` +
                        `${dateParts[1].padStart(2, '0')}-` +
                        `${dateParts[0].padStart(2, '0')}T` +
                        `${paddedTime}`;
                }


                /*
                 * Purchase:
                 * MM/DD/YYYY
                 */
                else {

                    isoString =
                        `${dateParts[2]}-` +
                        `${dateParts[0].padStart(2, '0')}-` +
                        `${dateParts[1].padStart(2, '0')}T` +
                        `${paddedTime}`;
                }


                const timestamp =
                    new Date(isoString).getTime();

                if (!Number.isNaN(timestamp)) {
                    return timestamp;
                }
            }
        }

    } catch (error) {

        console.warn(
            'Date normalization failed:',
            error
        );
    }


    /*
     * Generic fallback.
     */
    const fallback =
        new Date(raw).getTime();

    return Number.isNaN(fallback)
        ? 0
        : fallback;
}


/**
 * Extracts a timestamp from a dataset record.
 *
 * @param {Object} item Raw record.
 * @param {string} source Dataset source.
 * @returns {number}
 */
function getTimestamp(item, source) {

    if (source === 'purchase') {

        return parseDateSmart(
            item.trans_date_trans_time ||
            item.transaction_date ||
            item.date ||
            item.Date,
            source
        );
    }


    if (source === 'music') {

        return parseDateSmart(
            item.ts ||
            item.timestamp ||
            item.Date ||
            item.date,
            source
        );
    }


    return parseDateSmart(
        item.Date ||
        item.date ||
        item.timestamp ||
        item.ts,
        source
    );
}


/* =========================================================
   DATA LOADING
========================================================= */


/**
 * Fetches and parses JSON dataset.
 *
 * @returns {Promise<Array>}
 */
async function fetchPurchaseData() {

    const response =
        await fetch(
            'data/Augmented_IndiaTransactMultiFacet2024.json',
            {
                cache: 'no-cache'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Purchase dataset failed: ${response.status}`
        );
    }

    const data =
        await response.json();

    if (!Array.isArray(data)) {
        throw new Error(
            'Purchase dataset is not an array.'
        );
    }

    return data.map(item => {

        const timestamp =
            getTimestamp(item, 'purchase');

        return {

            source: 'purchase',

            timestamp,

            data: item,

            searchText:
                buildSearchText(item)

        };
    });
}


/**
 * Fetches and parses CSV dataset.
 *
 * @param {string} url CSV file path.
 * @param {string} sourceName Dataset identifier.
 *
 * @returns {Promise<Array>}
 */
async function fetchCsvData(url, sourceName) {

    const response =
        await fetch(
            url,
            {
                cache: 'no-cache'
            }
        );

    if (!response.ok) {
        throw new Error(
            `${sourceName} dataset failed: ${response.status}`
        );
    }


    const text =
        await response.text();


    return new Promise((resolve, reject) => {

        Papa.parse(
            text,
            {

                header: true,

                skipEmptyLines: true,

                complete(results) {

                    if (results.errors?.length) {

                        console.warn(
                            `${sourceName} CSV warnings:`,
                            results.errors
                        );
                    }


                    const normalized =
                        results.data.map(row => {

                            const timestamp =
                                getTimestamp(
                                    row,
                                    sourceName
                                );

                            return {

                                source: sourceName,

                                timestamp,

                                data: row,

                                searchText:
                                    buildSearchText(row)

                            };
                        });

                    resolve(normalized);
                },

                error(error) {
                    reject(error);
                }

            }
        );

    });
}


/**
 * Loads all datasets.
 *
 * Promise.allSettled allows the application
 * to continue even if one dataset fails.
 *
 * @returns {Promise<Array>}
 */
async function loadAllDatasets() {

    const results =
        await Promise.allSettled([

            fetchPurchaseData(),

            fetchCsvData(
                'data/spotify_history.csv',
                'music'
            ),

            fetchCsvData(
                'data/Daily Household Transactions.csv',
                'household'
            )

        ]);


    const successfulData = [];

    let failedDatasets = 0;


    results.forEach((result, index) => {

        if (result.status === 'fulfilled') {

            successfulData.push(
                ...result.value
            );

        } else {

            failedDatasets++;

            console.error(
                `Dataset ${index + 1} failed:`,
                result.reason
            );
        }

    });


    /*
     * If absolutely everything failed,
     * the application cannot continue.
     */
    if (
        successfulData.length === 0 &&
        failedDatasets === results.length
    ) {

        throw new Error(
            'All datasets failed to load.'
        );
    }


    return successfulData;
}

/* ============================================================
   MEMORY CONSTELLATION
============================================================ */

function ensureConstellationPanel() {

    if (DOM.constellationPanel) {
        return DOM.constellationPanel;
    }

    const panel = document.createElement('div');

    panel.id = 'constellation-panel';
    panel.className = 'constellation-panel';
    panel.setAttribute('aria-hidden', 'true');

    document.body.appendChild(panel);

    DOM.constellationPanel = panel;

    panel.addEventListener('click', event => {

        if (
            event.target === panel ||
            event.target.closest('[data-close-constellation]')
        ) {
            closeConstellation();
        }

    });

    return panel;
}

function showConstellation(storyId) {

    const storyItems = state.masterTimeline.filter(
        item => item.storyId === storyId
    );

    if (!storyItems.length) {
        announce('No story fragments available.');
        return;
    }

    const panel = ensureConstellationPanel();

    const summary = state.storySummaries.get(storyId);

    const centerX = 400;
    const centerY = 280;
    const radius = 190;

    const nodes = storyItems.slice(0, 12).map((item, index) => {

        const angle =
            (Math.PI * 2 * index) / Math.max(storyItems.length, 1);

        return {
            item,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        };

    });

    const nodeMap = new Map(
        nodes.map(node => [node.item.id, node])
    );

    const lines = [];

    storyItems.forEach(item => {

        const sourceNode = nodeMap.get(item.id);

        if (!sourceNode) return;

        const connections =
            state.connectionIndex.get(item.id) || [];

        connections.forEach(connection => {

            const targetNode = nodeMap.get(connection.to);

            if (!targetNode) return;

            if (item.id > connection.to) return;

            lines.push(`
                <line
                    x1="${sourceNode.x}"
                    y1="${sourceNode.y}"
                    x2="${targetNode.x}"
                    y2="${targetNode.y}"
                    class="constellation-line"
                    opacity="${Math.max(
                        0.25,
                        connection.score / 100
                    )}">
                </line>
            `);

        });

    });

    const nodeMarkup = nodes.map(node => {

        const item = node.item;

        const label = escapeHTML(
            getMemoryLabel(item)
        );

        const source = escapeHTML(
            getSourceLabel(item.source)
        );

        return `
            <g
                class="constellation-node"
                tabindex="0"
                role="button"
                data-memory-id="${escapeHTML(item.id)}">

                <circle
                    cx="${node.x}"
                    cy="${node.y}"
                    r="30">
                </circle>

                <text
                    x="${node.x}"
                    y="${node.y + 5}"
                    text-anchor="middle"
                    class="constellation-icon">

                    ${item.source === 'purchase'
                        ? '🧾'
                        : item.source === 'music'
                            ? '🎵'
                            : '📝'}

                </text>

                <text
                    x="${node.x}"
                    y="${node.y + 52}"
                    text-anchor="middle"
                    class="constellation-label">

                    ${label.substring(0, 24)}

                </text>

                <text
                    x="${node.x}"
                    y="${node.y + 68}"
                    text-anchor="middle"
                    class="constellation-source">

                    ${source}

                </text>

            </g>
        `;

    }).join('');

    panel.innerHTML = `

        <div
            class="constellation-inner"
            role="dialog"
            aria-modal="true"
            aria-labelledby="constellation-title">

            <button
                type="button"
                class="constellation-close"
                data-close-constellation
                aria-label="Close memory constellation">
                ×
            </button>

            <span class="connection-eyebrow">
                ✨ STORY MAP
            </span>

            <h2 id="constellation-title">
                Memory Constellation
            </h2>

            <p class="constellation-subtitle">
                See how your fragments connect to form one story.
            </p>

            <div class="constellation-meta">

                ${summary?.size || storyItems.length}
                fragments

                ·

                ${summary?.sourceCount || 1}
                activity types

            </div>

            <div class="constellation-canvas">

                <svg
                    viewBox="0 0 800 560"
                    role="img"
                    aria-label="Visual map of connected memory fragments">

                    ${lines.join('')}

                    <circle
                        cx="${centerX}"
                        cy="${centerY}"
                        r="54"
                        class="constellation-center">
                    </circle>

                    <text
                        x="${centerX}"
                        y="${centerY - 5}"
                        text-anchor="middle"
                        class="constellation-center-icon">
                        ✦
                    </text>

                    <text
                        x="${centerX}"
                        y="${centerY + 17}"
                        text-anchor="middle"
                        class="constellation-center-text">
                        YOUR STORY
                    </text>

                    ${nodeMarkup}

                </svg>

            </div>

            <p class="constellation-hint">
                Click any fragment to explore why it connects.
            </p>

        </div>
    `;

    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');

    panel.querySelectorAll(
        '[data-memory-id]'
    ).forEach(node => {

        node.addEventListener('click', () => {

            const memoryId =
                node.getAttribute('data-memory-id');

            closeConstellation();

            requestAnimationFrame(() => {
                showConnectionPanel(memoryId);
            });

        });

    });

    panel.querySelectorAll(
        '[data-memory-id]'
    ).forEach(node => {

        node.addEventListener('keydown', event => {

            if (
                event.key !== 'Enter' &&
                event.key !== ' '
            ) {
                return;
            }

            event.preventDefault();
            node.click();

        });

    });

}



function closeConstellation() {

    if (!DOM.constellationPanel) {
        return;
    }

    DOM.constellationPanel.classList.remove('is-open');

    DOM.constellationPanel.setAttribute(
        'aria-hidden',
        'true'
    );

}



function createConstellationButton() {

    const button =
        document.getElementById('constellation-btn');

    if (!button) return;

    DOM.constellationButton = button;

    button.addEventListener('click', () => {

        const strongest = getStrongestStory();

        if (!strongest) {

            announce(
                'No connected story is available yet.'
            );

            return;
        }

        showConstellation(
            strongest.storyId
        );

    });

}
/* =========================================================
   STORY GENERATION
========================================================= */


/**
 * Creates connected story groups from chronological events.
 *
 * @param {Array} timeline Normalized timeline.
 * @returns {Array}
 */
function createStories(timeline) {

    const sortedTimeline =
        [...timeline].sort(
            (a, b) =>
                a.timestamp - b.timestamp
        );


    let storyId = 1;

    let lastTimestamp =
        sortedTimeline[0]?.timestamp || 0;


    sortedTimeline.forEach(item => {

        if (
            item.timestamp -
            lastTimestamp >
            CONFIG.MAX_TIME_GAP_MS
        ) {

            storyId++;
        }


        item.storyId =
            `story-${storyId}`;


        lastTimestamp =
            item.timestamp;
    });


    return sortedTimeline;
}


/**
 * Randomizes timeline order using Fisher-Yates.
 *
 * @param {Array} array Array to shuffle.
 * @returns {Array}
 */
function shuffle(array) {

    const result =
        [...array];


    for (
        let i = result.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );


        [
            result[i],
            result[j]
        ] = [
            result[j],
            result[i]
        ];
    }


    return result;
}


/* =========================================================
   UI STATE MANAGEMENT
========================================================= */


/**
 * Shows or hides the loading state.
 *
 * @param {boolean} visible Whether loading should show.
 */
function setLoadingState(visible) {

    state.isLoading = visible;


    if (!DOM.loadingSpinner) {
        return;
    }


    DOM.loadingSpinner.style.display =
        visible ? 'block' : 'none';


    if (DOM.canvas) {

        DOM.canvas.setAttribute(
            'aria-busy',
            String(visible)
        );
    }
}


/**
 * Shows application error state.
 */
function showErrorState() {

    state.hasError = true;

    setLoadingState(false);


    if (DOM.canvas) {
        DOM.canvas.innerHTML = '';
    }


    if (DOM.emptyState) {
        DOM.emptyState.classList.add('d-none');
    }


    if (DOM.errorState) {
        DOM.errorState.classList.remove('d-none');
    }


    if (DOM.loadMoreContainer) {
        DOM.loadMoreContainer.style.display =
            'none';
    }


    announce(
        'Unable to load memory data.'
    );
}


/**
 * Hides error state.
 */
function hideErrorState() {

    state.hasError = false;


    if (DOM.errorState) {
        DOM.errorState.classList.add('d-none');
    }
}


/**
 * Shows empty search state.
 */
function showEmptyState() {

    if (DOM.emptyState) {
        DOM.emptyState.classList.remove('d-none');
    }


    if (DOM.loadMoreContainer) {
        DOM.loadMoreContainer.style.display =
            'none';
    }


    announce(
        'No memories found.'
    );
}


/**
 * Hides empty state.
 */
function hideEmptyState() {

    if (DOM.emptyState) {
        DOM.emptyState.classList.add('d-none');
    }
}


/**
 * Announces a message to screen readers.
 *
 * @param {string} message Announcement.
 */
function announce(message) {

    if (!DOM.resultStatus) {
        return;
    }


    DOM.resultStatus.textContent =
        message;
}


/* =========================================================
   RENDERING
========================================================= */


/**
 * Returns a formatted date.
 *
 * @param {number} timestamp Epoch timestamp.
 * @returns {string}
 */
function formatDate(timestamp) {

    return new Date(timestamp)
        .toLocaleDateString(
            CONFIG.DATE_LOCALE,
            {
                month: 'short',
                day: 'numeric'
            }
        );
}


/**
 * Returns a formatted time.
 *
 * @param {number} timestamp Epoch timestamp.
 * @returns {string}
 */
function formatTime(timestamp) {

    return new Date(timestamp)
        .toLocaleTimeString(
            CONFIG.DATE_LOCALE,
            {
                hour: '2-digit',
                minute: '2-digit'
            }
        );
}


/**
 * Creates purchase memory card HTML.
 *
 * @param {Object} item Memory item.
 * @returns {string}
 */
function createPurchaseCard(item) {

    const merchant =
        escapeHTML(
            item.data.merchant ||
            'Store'
        );


    const amount =
        escapeHTML(
            item.data.amt ||
            item.data.amount ||
            '0'
        );


    const category =
        escapeHTML(
            item.data.category ||
            'General'
        );


    const date =
        formatDate(item.timestamp);


    const storyId =
        escapeHTML(item.storyId);


    const ariaLabel =
        escapeHTML(
            `Purchase at ${merchant} for ₹${amount}`
        );


    return `
        <article
            class="memory-card style-receipt"
            data-story="${storyId}"
            role="button"
            tabindex="0"
            aria-expanded="false"
            aria-label="${ariaLabel}"
        >

            <div class="receipt-header">
                ${merchant.substring(
                    0,
                    CONFIG.MAX_MERCHANT_LENGTH
                )}
            </div>

            <div class="item-row">
                <span>Date</span>
                <span>${date}</span>
            </div>

            <div class="item-row">
                <span>Type</span>
                <span>${category}</span>
            </div>

            <div class="total-row">
                <span>TOTAL</span>
                <span>₹${amount}</span>
            </div>

        </article>
    `;
}


/**
 * Creates household note card HTML.
 *
 * @param {Object} item Memory item.
 * @returns {string}
 */
function createHouseholdCard(item) {

    const note =
        escapeHTML(
            item.data.Note ||
            item.data.Subcategory ||
            'Note'
        );


    const storyId =
        escapeHTML(item.storyId);


    const ariaLabel =
        escapeHTML(
            `Note: ${note}`
        );


    return `
        <article
            class="memory-card style-sticky"
            data-story="${storyId}"
            role="button"
            tabindex="0"
            aria-expanded="false"
            aria-label="${ariaLabel}"
        >
            "${note}"
        </article>
    `;
}


/**
 * Creates music memory card HTML.
 *
 * @param {Object} item Memory item.
 * @returns {string}
 */
function createMusicCard(item) {

    const track =
        escapeHTML(
            item.data.track_name ||
            'Track'
        );


    const artist =
        escapeHTML(
            item.data.artist_name ||
            'Artist'
        );


    const storyId =
        escapeHTML(item.storyId);


    const time =
        formatTime(item.timestamp);


    const ariaLabel =
        escapeHTML(
            `Listened to ${track} by ${artist}`
        );


    return `
        <article
            class="memory-card style-music"
            data-story="${storyId}"
            role="button"
            tabindex="0"
            aria-expanded="false"
            aria-label="${ariaLabel}"
        >

            <div
                class="music-icon"
                aria-hidden="true">
                🎵
            </div>

            <div class="music-details">

                <span class="music-title">
                    ${track}
                </span>

                <span class="music-artist">
                    ${artist}
                </span>

                <span class="music-time">
                    🕒 ${time}
                </span>

            </div>

        </article>
    `;
}


/**
 * Creates a memory card.
 *
 * @param {Object} item Memory item.
 * @returns {HTMLElement}
 */
function createMemoryCard(item) {

    const wrapper =
        document.createElement('div');


    const rotation =
        window.innerWidth > 768
            ? (Math.random() * 12) - 6
            : 0;


    let html;


    if (item.source === 'purchase') {

        html =
            createPurchaseCard(item);

    } else if (item.source === 'household') {

        html =
            createHouseholdCard(item);

    } else {

        html =
            createMusicCard(item);
    }


    wrapper.innerHTML =
        html.trim();


    const element =
        wrapper.firstElementChild;


    if (element) {

        element.style.transform =
            `rotate(${rotation}deg)`;

        attachMemoryInteraction(
            element
        );
    }


    return element;
}


/* =========================================================
   MEMORY INTERACTION
========================================================= */


/**
 * Handles click and keyboard interaction for memory cards.
 *
 * @param {HTMLElement} element Memory card.
 */
function attachMemoryInteraction(element) {

    const toggle =
        event => {

            if (
                event.type === 'keydown' &&
                event.key !== 'Enter' &&
                event.key !== ' '
            ) {
                return;
            }


            if (event.type === 'keydown') {
                event.preventDefault();
            }


            const storyId =
                element.getAttribute(
                    'data-story'
                );


            const isHighlighted =
                element.classList.contains(
                    'highlighted'
                );


            const cards =
                document.querySelectorAll(
                    '.memory-card'
                );


            cards.forEach(card => {

                const sameStory =
                    card.getAttribute(
                        'data-story'
                    ) === storyId;


                if (isHighlighted) {

                    card.classList.remove(
                        'dimmed',
                        'highlighted'
                    );


                    card.setAttribute(
                        'aria-expanded',
                        'false'
                    );

                } else {

                    if (sameStory) {

                        card.classList.remove(
                            'dimmed'
                        );

                        card.classList.add(
                            'highlighted'
                        );

                        card.setAttribute(
                            'aria-expanded',
                            'true'
                        );

                    } else {

                        card.classList.remove(
                            'highlighted'
                        );

                        card.classList.add(
                            'dimmed'
                        );

                        card.setAttribute(
                            'aria-expanded',
                            'false'
                        );
                    }
                }
            });


            announce(
                isHighlighted
                    ? 'Story connection closed.'
                    : 'Related memory fragments highlighted.'
            );
        };


    element.addEventListener(
        'click',
        toggle
    );


    element.addEventListener(
        'keydown',
        toggle
    );
}


/* =========================================================
   FILTERING & SEARCH
========================================================= */


/**
 * Applies current filter and search query.
 *
 * @returns {Array}
 */

/* ============================================================
   INTELLIGENT MEMORY SEARCH
============================================================ */

/**
 * Common words that should not influence relevance heavily.
 */
const SEARCH_STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'for',
    'to',
    'of',
    'in',
    'on',
    'at',
    'is',
    'my',
    'me',
    'with',
    'from',
    'this',
    'that',
    'memory',
    'memories'
]);


/**
 * Search aliases.
 *
 * This allows natural language queries such as:
 *
 * "songs"       -> music
 * "receipts"    -> purchase
 * "shopping"    -> purchase
 * "notes"       -> household
 */
const SEARCH_ALIASES = Object.freeze({

    music: [
        'music',
        'song',
        'songs',
        'track',
        'tracks',
        'spotify',
        'playlist',
        'audio',
        'artist'
    ],

    purchase: [
        'purchase',
        'purchases',
        'receipt',
        'receipts',
        'buy',
        'bought',
        'shopping',
        'shop',
        'payment',
        'transaction',
        'transactions',
        'spending',
        'expense',
        'expenses'
    ],

    household: [
        'note',
        'notes',
        'household',
        'daily',
        'home',
        'grocery',
        'groceries'
    ]

});


/**
 * Tokenize a search query.
 */
function tokenizeSearchQuery(query) {

    return normalizeSearchText(query)
        .split(/\s+/)
        .map(token =>
            token.replace(/[^\w.-]/g, '')
        )
        .filter(token =>
            token.length >= 2 &&
            !SEARCH_STOP_WORDS.has(token)
        );

}


/**
 * Calculates Levenshtein edit distance.
 *
 * Used for typo tolerance.
 *
 * Example:
 *
 * coffee
 * cofee
 *
 * distance = 1
 */
function levenshteinDistance(a, b) {

    if (a === b) {
        return 0;
    }

    if (!a.length) {
        return b.length;
    }

    if (!b.length) {
        return a.length;
    }

    const previous = Array.from(
        { length: b.length + 1 },
        (_, index) => index
    );

    for (let i = 1; i <= a.length; i++) {

        const current = [i];

        for (let j = 1; j <= b.length; j++) {

            const insertCost =
                current[j - 1] + 1;

            const deleteCost =
                previous[j] + 1;

            const replaceCost =
                previous[j - 1] +
                (a[i - 1] === b[j - 1] ? 0 : 1);

            current[j] = Math.min(
                insertCost,
                deleteCost,
                replaceCost
            );

        }

        for (let j = 0; j < current.length; j++) {
            previous[j] = current[j];
        }

    }

    return previous[b.length];

}


/**
 * Fuzzy token similarity.
 *
 * Returns a value between 0 and 1.
 */
function fuzzyTokenScore(queryToken, textToken) {

    if (!queryToken || !textToken) {
        return 0;
    }

    if (queryToken === textToken) {
        return 1;
    }

    if (textToken.startsWith(queryToken)) {
        return 0.92;
    }

    if (queryToken.startsWith(textToken)) {
        return 0.85;
    }

    if (
        queryToken.length >= 4 &&
        textToken.includes(queryToken)
    ) {
        return 0.80;
    }

    const distance =
        levenshteinDistance(
            queryToken,
            textToken
        );

    const maxLength =
        Math.max(
            queryToken.length,
            textToken.length
        );

    if (maxLength === 0) {
        return 0;
    }

    const similarity =
        1 - (distance / maxLength);

    /*
     * Only accept useful fuzzy matches.
     *
     * Short words need a closer match.
     */
    const threshold =
        queryToken.length <= 4
            ? 0.72
            : 0.58;

    return similarity >= threshold
        ? similarity
        : 0;

}


/**
 * Detect semantic category from query.
 */
function detectSearchSources(tokens) {

    const sources = new Set();

    tokens.forEach(token => {

        Object.entries(
            SEARCH_ALIASES
        ).forEach(([source, aliases]) => {

            if (aliases.includes(token)) {
                sources.add(source);
            }

        });

    });

    return sources;

}


/**
 * Extract searchable tokens from a memory.
 */
function getSearchTokens(item) {

    return item.searchText
        .split(/\s+/)
        .map(token =>
            token.replace(/[^\w.-]/g, '')
        )
        .filter(Boolean);

}


/**
 * Calculate relevance of one memory.
 */
function calculateSearchScore(
    item,
    query,
    queryTokens
) {

    const text =
        item.searchText || '';

    const textTokens =
        getSearchTokens(item);

    let score = 0;

    /*
     * --------------------------------------------------------
     * 1. Exact full phrase
     * --------------------------------------------------------
     */

    if (text.includes(query)) {
        score += 55;
    }


    /*
     * --------------------------------------------------------
     * 2. Exact token matching
     * --------------------------------------------------------
     */

    let matchedTokens = 0;

    queryTokens.forEach(queryToken => {

        if (textTokens.includes(queryToken)) {

            score += 30;
            matchedTokens++;

            return;
        }

        /*
         * ----------------------------------------------------
         * 3. Prefix matching
         * ----------------------------------------------------
         */

        const prefixMatch =
            textTokens.some(
                textToken =>
                    textToken.startsWith(queryToken)
            );

        if (prefixMatch) {

            score += 22;
            matchedTokens++;

            return;
        }


        /*
         * ----------------------------------------------------
         * 4. Fuzzy / typo matching
         * ----------------------------------------------------
         */

        let bestFuzzyScore = 0;

        textTokens.forEach(textToken => {

            const fuzzyScore =
                fuzzyTokenScore(
                    queryToken,
                    textToken
                );

            bestFuzzyScore =
                Math.max(
                    bestFuzzyScore,
                    fuzzyScore
                );

        });

        if (bestFuzzyScore > 0) {

            score +=
                Math.round(
                    bestFuzzyScore * 20
                );

            matchedTokens++;

        }

    });


    /*
     * --------------------------------------------------------
     * 5. Multi-word query bonus
     * --------------------------------------------------------
     */

    if (
        queryTokens.length > 1 &&
        matchedTokens === queryTokens.length
    ) {

        score += 30;

    }


    /*
     * --------------------------------------------------------
     * 6. Semantic source boost
     * --------------------------------------------------------
     */

    const detectedSources =
        detectSearchSources(
            queryTokens
        );

    if (
        detectedSources.has(
            item.source
        )
    ) {

        score += 35;

    }


    /*
     * --------------------------------------------------------
     * 7. Connected-memory boost
     *
     * A memory that participates in more
     * relationships becomes more useful
     * for story discovery.
     * --------------------------------------------------------
     */

    const connections =
        state.connectionIndex.get(item.id);

    if (connections?.length) {

        score += Math.min(
            connections.length * 2,
            12
        );

    }


    /*
     * --------------------------------------------------------
     * 8. Story boost
     * --------------------------------------------------------
     */

    if (item.storyId) {

        const storyItems =
            state.masterTimeline.filter(
                memory =>
                    memory.storyId ===
                    item.storyId
            );

        if (storyItems.length >= 3) {

            score += 5;

        }

    }


    return score;

}


/**
 * Main intelligent search.
 */
function intelligentSearch(
    items,
    query
) {

    const queryTokens =
        tokenizeSearchQuery(query);

    if (!queryTokens.length) {
        return items;
    }

    const results = [];

    items.forEach(item => {

        const score =
            calculateSearchScore(
                item,
                query,
                queryTokens
            );

        if (score > 0) {

            results.push({
                item,
                score
            });

        }

    });


    /*
     * Highest relevance first.
     *
     * Timestamp is used only as a
     * stable secondary ordering.
     */
    results.sort((a, b) => {

        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return (
            b.item.timestamp -
            a.item.timestamp
        );

    });


    return results.map(
        result => result.item
    );

}

/* ============================================================
   SEARCH SUGGESTIONS
============================================================ */

function getSearchSuggestions(query) {

    const tokens =
        tokenizeSearchQuery(query);

    if (!tokens.length) {
        return [];
    }

    const suggestions = [];

    /*
     * Category suggestions
     */
    const detectedSources =
        detectSearchSources(tokens);

    detectedSources.forEach(source => {

        suggestions.push({
            type: 'category',
            value: source,
            label:
                source === 'music'
                    ? '🎵 Music'
                    : source === 'purchase'
                        ? '🧾 Purchases'
                        : '📝 Notes'
        });

    });


    /*
     * Extract meaningful words from memories.
     */
    const wordFrequency = new Map();

    state.masterTimeline.forEach(item => {

        getSearchTokens(item)
            .forEach(word => {

                if (
                    word.length < 3 ||
                    SEARCH_STOP_WORDS.has(word)
                ) {
                    return;
                }

                if (
                    tokens.some(
                        token =>
                            word.startsWith(token) ||
                            token.startsWith(word)
                    )
                ) {

                    wordFrequency.set(
                        word,
                        (wordFrequency.get(word) || 0) + 1
                    );

                }

            });

    });


    [...wordFrequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .forEach(([word]) => {

            suggestions.push({
                type: 'term',
                value: word,
                label: `🔎 ${word}`
            });

        });


    return suggestions.slice(0, 7);

}


function renderSearchSuggestions(query) {

    const container =
        document.getElementById(
            'search-suggestions'
        );

    if (!container) {
        return;
    }

    const suggestions =
        getSearchSuggestions(query);

    if (!query.trim() || !suggestions.length) {

        container.innerHTML = '';

        container.classList.remove(
            'is-visible'
        );

        DOM.searchInput?.setAttribute(
            'aria-expanded',
            'false'
        );

        return;

    }


    container.innerHTML =
        suggestions.map(
            (suggestion, index) => `

                <button
                    type="button"
                    class="search-suggestion"
                    role="option"
                    data-search-value="${escapeHTML(
                        suggestion.value
                    )}"
                    id="search-suggestion-${index}">

                    ${escapeHTML(
                        suggestion.label
                    )}

                </button>

            `
        ).join('');


    container.classList.add(
        'is-visible'
    );

    DOM.searchInput?.setAttribute(
        'aria-expanded',
        'true'
    );


    container
        .querySelectorAll(
            '.search-suggestion'
        )
        .forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    const value =
                        button.getAttribute(
                            'data-search-value'
                        );

                    if (!DOM.searchInput) {
                        return;
                    }

                    DOM.searchInput.value =
                        value;

                    state.searchQuery =
                        value;

                    renderSearchSuggestions('');

                    renderCards(true);

                    DOM.searchInput.focus();

                }
            );

        });

}
function getFilteredTimeline() {

    const filter = state.currentFilter;
    const query = normalizeSearchText(state.searchQuery);

    const baseResults = state.masterTimeline.filter(item => {

        return (
            filter === 'all' ||
            item.source === filter
        );

    });

    // No search query = normal filtering
    if (!query) {
        return baseResults;
    }

    return intelligentSearch(
        baseResults,
        query
    );

}

/**
 * Recalculates filtered data.
 */
function applyFilters() {

    state.filteredTimeline =
        getFilteredTimeline();
}


/* =========================================================
   MAIN CARD RENDERER
========================================================= */


/**
 * Renders memory cards.
 *
 * @param {boolean} reset Whether to reset pagination.
 */
function renderCards(reset = false) {

    if (!DOM.canvas) {
        return;
    }


    if (reset) {

        state.currentlyDisplayed = 0;

        DOM.canvas.innerHTML = '';

        applyFilters();
    }


    hideErrorState();


    /*
     * No results.
     */
    if (
        state.filteredTimeline.length === 0
    ) {

        showEmptyState();

        return;
    }


    hideEmptyState();


    const start =
        state.currentlyDisplayed;


    const end =
        Math.min(
            start + CONFIG.ITEMS_PER_PAGE,
            state.filteredTimeline.length
        );


    const chunk =
        state.filteredTimeline.slice(
            start,
            end
        );


    const fragment =
        document.createDocumentFragment();


    chunk.forEach(item => {

        const card =
            createMemoryCard(item);


        if (card) {

            fragment.appendChild(
                card
            );
        }
    });


    DOM.canvas.appendChild(
        fragment
    );


    state.currentlyDisplayed =
        end;


    updatePagination();


    announce(
        `Showing ${state.currentlyDisplayed} of ${state.filteredTimeline.length} memories.`
    );
}


/**
 * Updates load-more visibility.
 */
function updatePagination() {

    if (!DOM.loadMoreContainer) {
        return;
    }


    const hasMore =
        state.currentlyDisplayed <
        state.filteredTimeline.length;


    DOM.loadMoreContainer.style.display =
        hasMore ? 'block' : 'none';


    if (DOM.loadMoreButton) {

        DOM.loadMoreButton.setAttribute(
            'aria-label',
            `Load more memories. ${Math.max(
                0,
                state.filteredTimeline.length -
                state.currentlyDisplayed
            )} remaining.`
        );
    }
}


/* =========================================================
   SEARCH
========================================================= */

let searchDebounceTimer = null;


/**
 * Handles search input.
 *
 * @param {Event} event Input event.
 */
function handleSearch(event) {

    clearTimeout(
        searchDebounceTimer
    );


    searchDebounceTimer =
        setTimeout(() => {

            state.searchQuery =
                event.target.value.trim();


            renderCards(true);

        }, CONFIG.SEARCH_DEBOUNCE_MS);
}


/**
 * Clears search state.
 */
function clearSearch() {

    state.searchQuery = '';


    if (DOM.searchInput) {

        DOM.searchInput.value = '';

        DOM.searchInput.focus();
    }


    renderCards(true);
}


/* =========================================================
   FILTER BUTTONS
========================================================= */


/**
 * Updates active filter button.
 *
 * @param {HTMLElement} activeButton Selected button.
 */
function updateActiveFilter(activeButton) {

    const buttons =
        DOM.filterButtons
            ?.querySelectorAll(
                '.filter-btn'
            );


    buttons?.forEach(button => {

        const isActive =
            button === activeButton;


        button.classList.toggle(
            'active',
            isActive
        );


        button.setAttribute(
            'aria-pressed',
            String(isActive)
        );
    });
}


/**
 * Handles filter selection.
 *
 * @param {Event} event Click event.
 */
function handleFilterClick(event) {

    const button =
        event.target.closest(
            '.filter-btn'
        );


    if (!button) {
        return;
    }


    const selectedFilter =
        button.getAttribute(
            'data-filter'
        );


    if (!selectedFilter) {
        return;
    }


    state.currentFilter =
        selectedFilter;


    updateActiveFilter(
        button
    );


    renderCards(true);
}


/* =========================================================
   RETRY
========================================================= */


/**
 * Reloads application data.
 */
async function retryApplication() {

    if (
        state.retryCount >=
        CONFIG.MAX_RETRY_ATTEMPTS
    ) {

        announce(
            'Maximum retry attempts reached.'
        );

        return;
    }


    state.retryCount++;


    await initApp();
}


/* =========================================================
   APPLICATION INITIALIZATION
========================================================= */


/**
 * Initializes the application.
 *
 * @returns {Promise<void>}
 */
async function initApp() {

    setLoadingState(true);

    hideErrorState();

    hideEmptyState();


    try {

        const timeline =
            await loadAllDatasets();


        /*
         * Remove invalid records.
         */
        const validTimeline =
            timeline.filter(
                item =>
                    item.timestamp > 0 &&
                    item.data
            );


        if (
            validTimeline.length === 0
        ) {

            throw new Error(
                'No valid memory records were found.'
            );
        }


        /*
         * Create chronological story groups.
         */
        const storyTimeline =
            createStories(
                validTimeline
            );


        /*
         * Shuffle only after stories
         * have been calculated.
         */
        const shuffledTimeline =
            shuffle(
                storyTimeline
            );


        state.masterTimeline =
            shuffledTimeline;


        state.filteredTimeline =
            [...shuffledTimeline];


        state.currentlyDisplayed = 0;

        state.retryCount = 0;


        setLoadingState(false);

        renderCards(true);


    } catch (error) {

        console.error(
            'Application initialization failed:',
            error
        );


        setLoadingState(false);

        showErrorState();
    }
}


/* =========================================================
   EVENT LISTENERS
========================================================= */


/**
 * Registers application event listeners.
 */
function registerEventListeners() {

    /*
     * Load more.
     */
    DOM.loadMoreButton?.addEventListener(
        'click',
        () => renderCards(false)
    );


    /*
     * Search.
     */
    DOM.searchInput?.addEventListener(
        'input',
        handleSearch
    );


    /*
     * Filters.
     */
    DOM.filterButtons?.addEventListener(
        'click',
        handleFilterClick
    );


    /*
     * Clear search.
     */
    DOM.clearSearchButton?.addEventListener(
        'click',
        clearSearch
    );


    /*
     * Retry.
     */
    DOM.retryButton?.addEventListener(
        'click',
        retryApplication
    );

}


/* =========================================================
   APPLICATION BOOTSTRAP
========================================================= */


/**
 * Starts the application after DOM is ready.
 */
function bootstrap() {

    cacheDOM();

    registerEventListeners();

    initApp();
}


if (
    document.readyState === 'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        bootstrap,
        {
            once: true
        }
    );

} else {

    bootstrap();
}