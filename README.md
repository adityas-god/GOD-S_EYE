# Enterprise Operations Dashboard (Industrial Grey & Orange Theme)

A production-grade, highly scalable executive Operations Dashboard engineered with React 18, TypeScript, Tailwind CSS, Node.js/Express, and MongoDB Atlas.

Built specifically for high-throughput facility operations, 80+ enterprise sites categorized across product lines, automated Salesforce incident telemetry, and live Grafana embedded dashboards.

---

## 🎨 Design System & Industrial Palette

| Token | Hex / Value | Description |
|---|---|---|
| **Dark Slate Background** | `#0B0E14` | Main executive dark canvas |
| **Dark Charcoal Cards** | `#121722` / `#161C28` | Container panels, modals, and telemetry frames |
| **Vivid Orange Accent** | `#FF7A00` | Primary brand accent, focus rings, and active state highlights |
| **RED Severity** | `#EF4444` | $\ge 1$ SEV 1 Critical ticket on day |
| **YELLOW Severity** | `#F59E0B` | $\ge 2$ SEV 2 Major tickets on day |
| **BLUE Severity** | `#3B82F6` | Only SEV 3 Minor tickets or single SEV 2 |
| **GREEN Normal** | `#10B981` | 0 tickets logged / Optimal operational state |

---

## 📂 Architecture & Directory Structure

```
RAW/
├── backend/
│   ├── src/
│   │   ├── microservices/
│   │   │   ├── sites/                 # Site Directory (80+ sites, categorized by RTP/TTP, RMS, RA, RIL, Case Pick)
│   │   │   ├── salesforce/            # Salesforce Apex & Incident cases, calendar severity engine, trends
│   │   │   ├── grafana/               # Grafana 12-panel persistence via MongoDB Atlas
│   │   │   └── infra/                 # Infrastructure & Subsystem telemetry health
│   │   ├── models/                    # Mongoose Models (Site, SalesforceTicket, SitePanel)
│   │   ├── seed/                      # Auto-seed logic for MongoDB Atlas
│   │   ├── test/                      # Severity Engine unit test suite
│   │   ├── types/                     # Shared TypeScript type definitions
│   │   └── index.ts                   # Master Express server & API routes
│   ├── .env
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx             # Brand header, site category selector & time indicator
│   │   │   ├── Sidebar.tsx            # Collapsible navigation drawer
│   │   │   ├── SiteSelector/
│   │   │   │   └── CategorizedSiteModal.tsx # Enterprise categorized site selector (80+ sites)
│   │   │   ├── Calendar/
│   │   │   │   ├── OperationsCalendar.tsx   # Interactive severity calendar grid
│   │   │   │   └── DateSfTicketsModal.tsx   # Day-specific itemized incident details
│   │   │   ├── Analytics/
│   │   │   │   └── TicketFlowTrendChart.tsx # Incident flow timeline chart
│   │   │   ├── Services/
│   │   │   │   └── RightServicesPanel.tsx   # Subsystem health status & live service embed
│   │   │   ├── Tickets/
│   │   │   │   └── RecentTicketsTable.tsx   # Searchable incident table with triage filters
│   │   │   ├── Grafana/
│   │   │   │   └── ActiveDashboardViewer.tsx# Live Grafana dashboard embed & metric pills
│   │   │   └── Admin/
│   │   │       ├── AdminEmbedModal.tsx      # Admin panel management modal
│   │   │       └── EditDashboardLinkModal.tsx # 12 direct link configuration modal
│   │   ├── context/
│   │   │   ├── DashboardContext.tsx   # Central reactive application state
│   │   │   └── useDashboard.ts        # Typed context hook
│   │   ├── scenes/
│   │   │   └── SamsAtlDashboard.tsx   # Subsystem telemetry scene view
│   │   ├── types/
│   │   │   ├── dashboard.ts           # Core dashboard interfaces
│   │   │   ├── sites.ts               # Enterprise sites catalog & categorizations
│   │   │   └── twelveLinks.ts         # 12 telemetry & metric panel keys
│   │   ├── App.tsx                    # Executive Operations layout
│   │   ├── main.tsx                   # React bootstrap
│   │   └── index.css                  # Tailored industrial CSS & scrollbars
│   ├── vite.config.ts
│   └── package.json
│
└── README.md
```

---

## 🚀 Running the Project

### 1. Start the Backend API (Port 5000)

```bash
cd backend
npm install
npm run dev
```

### 2. Start the Frontend Application (Port 3000)

In a second terminal window:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🐳 Production Deployment (Docker Compose & Cloud VM)

This project is fully containerized and configured for zero-downtime, isolated deployment on Linux VMs (Ubuntu 22.04 LTS) alongside existing services (e.g. `Auto_BOT` on port 5000):

- **Host Port**: `8000` (maps to frontend Nginx container; backend runs inside private Docker network `ops-network` on container port 5000 without colliding with host port 5000).
- **Public URL**: `http://<VM_EXTERNAL_IP>:8000`
- **Container Names**: `ops-dashboard-frontend`, `ops-dashboard-backend`

### Quick Start with Docker:

```bash
# 1. Clone repository to dedicated VM folder
git clone https://github.com/adityas-god/GOD-S_EYE.git /home/ubuntu/GOD-S_EYE
cd /home/ubuntu/GOD-S_EYE

# 2. Copy and configure environment variables
cp .env.example .env

# 3. Build and launch isolated stack
docker compose up -d --build

# 4. Verify health
curl http://localhost:8000/health
```

---

## ⚡ Severity Hierarchy Logic

| Condition | Day Color | Hex Code | Priority |
|---|---|---|---|
| **$\ge 1$ SEV 1 Ticket** | 🔴 **RED** | `#EF4444` | **Highest** (Critical incident present) |
| **$\ge 2$ SEV 2 Tickets** | 🟡 **YELLOW** | `#F59E0B` | **High** (Multiple major incidents, 0 SEV 1) |
| **SEV 3 Only or 1 SEV 2** | 🔵 **BLUE** | `#3B82F6` | **Moderate** (Minor incident presence) |
| **0 Logged Tickets** | 🟢 **GREEN** | `#10B981` | **Normal** (Clean operational health) |

---

## 📡 Microservices API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/sites` | `GET` | Flat directory of all 80+ enterprise sites |
| `/api/sites/categorized` | `GET` | Sites grouped by category (RTP/TTP, RMS, RA, RIL, Case Pick) |
| `/api/salesforce/calendar/:siteId` | `GET` | Monthly calendar severity calculations |
| `/api/salesforce/tickets/:siteId` | `GET` | Itemized incident tickets for selected site/date |
| `/api/salesforce/trends/:siteId` | `GET` | 90-day incident distribution trend data |
| `/api/grafana/panels/:siteId` | `GET` | 12 custom Grafana panel links for the site |
| `/api/grafana/panels/:siteId/:panelIndex`| `PUT` | Update/persist custom dashboard link in MongoDB Atlas |
| `/api/infra/:siteId/health` | `GET` | Live telemetry & subsystem health status |
| `/api/proxy-dashboard?url=...` | `GET` | Streamlined reverse proxy to bypass iframe embedding restrictions |
