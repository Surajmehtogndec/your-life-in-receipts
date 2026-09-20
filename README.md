# 🧾 Your Life, In Receipts

> **Turn everyday digital fragments into connected stories.**

Your Life, In Receipts is an interactive memory-exploration web experience that brings together different fragments of everyday digital life and turns them into a visual timeline of moments.

Instead of viewing music, purchases, and daily-life records as isolated data points, the application looks for relationships between them and helps users discover meaningful connections.

---

## 🌟 Why This Project?

Our digital lives are scattered across different platforms.

A song we listened to, something we purchased, or a daily transaction may each look insignificant on its own.

But when these fragments are viewed together, they can reveal a larger story.

**Your Life, In Receipts** explores this idea by:

- Bringing multiple datasets into one timeline
- Searching across different types of memories
- Connecting related moments
- Grouping connected moments into stories
- Helping users explore their digital life through an interactive interface

---

# ✨ Key Features

## 1. Unified Memory Timeline

Multiple datasets are normalized into a common memory format and displayed together.

Supported data sources include:

- 🎵 Music history
- 🛍️ Purchase transactions
- 🏠 Daily household transactions

---

## 2. Intelligent Search

The search system goes beyond simple exact keyword matching.

It supports:

- Keyword matching
- Prefix matching
- Small spelling mistakes
- Common aliases
- Multi-word searches
- Relevance-based ranking
- Connected-story boosting

### Example

Searching:

`cofee`

can still surface relevant coffee-related memories.

Searching:

`spotify`

can surface music memories.

Searching:

`shopping`

can surface purchase-related memories.

---

## 3. Meaningful Filters

Users can explore memories using meaningful categories:

- ✨ All Moments
- 🎵 Music
- 🛍️ Purchases
- 🏠 Daily Life
- 🔗 Connected Stories
- ⭐ Highlights

These filters are designed around how users explore memories rather than exposing raw dataset names.

---

## 4. Connected Stories

The application analyzes relationships between memory items.

Connections can be based on signals such as:

- Same day
- Nearby timestamps
- Shared keywords
- Different data sources

Related memories can therefore become part of a larger story.

---

## 5. Memory Constellation

The project includes a visual exploration concept that represents connected memories as a constellation.

Each memory becomes a node, while relationships between memories become connections.

This helps users visually understand how separate fragments can belong to the same story.

---

## 6. Responsive Design

The interface adapts to:

- Desktop
- Laptop
- Tablet
- Mobile

The memory grid, filters, search interface, dialogs, and visualizations adapt to smaller screens.

---

## 7. Accessibility

The interface includes accessibility considerations such as:

- Keyboard navigation
- Visible keyboard focus
- ARIA labels
- Accessible filter states
- Live result announcements
- Accessible dialogs
- Escape-key dialog closing
- Skip navigation
- Reduced-motion support

---

# 🏗️ Project Architecture

The project is intentionally lightweight and runs entirely in the browser.

```text
                    ┌─────────────────────┐
                    │      index.html     │
                    │    User Interface   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │       app.js        │
                    │ Application Logic   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       Spotify History    Purchase Data   Household Data
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Data Normalization  │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Unified Timeline    │
                    └──────────┬──────────┘
                               ▼
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
       Search & Filters                  Connections
                                                │
                                                ▼
                                         Story Clusters
                                                │
                                                ▼
                                      Memory Constellation





                                      UiHackathon/
│
├── index.html
│   └── Main application interface
│
├── style.css
│   └── Visual design, responsive layout and accessibility styles
│
├── app.js
│   └── Application logic, data loading, searching,
│       filtering, connections and story generation
│
├── spotify_history.csv
│   └── Music listening history
│
├── spotify_data_dictionary.csv
│   └── Description of Spotify dataset fields
│
├── Daily Household Transactions.csv
│   └── Daily household transaction records
│
├── Augmented_IndiaTransactMultiFacet2024.json
│   └── Purchase transaction data
│
└── README.md
    └── Project documentation


    Raw Datasets
     ↓
Data Loading
     ↓
Data Normalization
     ↓
Unified Memory Timeline
     ↓
Connection Analysis
     ↓
Story Clustering
     ↓
Search / Filter
     ↓
Interactive Memory Cards
     ↓
Connected Story Exploration



## 🖼️ Screenshots

### Desktop
![Desktop View](screenshots/desktop.png)

### Mobile
![Mobile View](screenshots/mobile.png)

### Connected Stories
![Connected Stories](screenshots/connected-story.png)

### Memory Constellation
![Memory Constellation](screenshots/constellation.png)