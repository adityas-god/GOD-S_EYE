# Operations Dashboard (Industrial Grey & Orange Theme)

A production-grade, highly scalable executive Operations Dashboard engineered with React 18, TypeScript, Tailwind CSS, Node.js/Express, Docker, and MongoDB Atlas.

Built specifically for high-throughput facility operations, 109 enterprise sites categorized across product lines, automated Salesforce incident telemetry, direct InfluxDB telemetry, and live Grafana embedded dashboards.

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
GOD-S_EYE/
├── backend/
│   ├── src/
│   │   ├── microservices/
│   │   │   ├── sites/                 # Site Intelligence & Notes (109 sites, VM IPs, CEM, Slack, Notes)
│   │   │   ├── salesforce/            # Incident cases, calendar severity engine, trends, catalog
│   │   │   ├── grafana/               # Grafana panel persistence & embed management
│   │   │   └── influx/                # InfluxDB telemetry querying (il-influxdb2)
│   │   ├── models/                    # Mongoose Models (Site, SalesforceTicket, SitePanel)
│   │   ├── seed/                      # Auto-seed logic for MongoDB Atlas
│   │   ├── test/                      # Severity Engine unit test suite
│   │   ├── types/                     # Shared TypeScript type definitions
│   │   └── index.ts                   # Master Express server, reverse proxy & API routes
│   ├── .env.example
│   ├── Dockerfile                     # Multi-stage Node 20 Alpine container
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx             # Brand header, site category selector & time indicator
│   │   │   ├── Sidebar.tsx            # Collapsible navigation drawer
│   │   │   ├── SiteSelector/
│   │   │   │   └── CategorizedSiteModal.tsx # Enterprise categorized site selector (109 sites)
│   │   │   ├── Calendar/
│   │   │   │   ├── OperationsCalendar.tsx   # Interactive severity calendar grid
│   │   │   │   └── DateSfTicketsModal.tsx   # Day-specific itemized incident details
│   │   │   ├── Analytics/
│   │   │   │   └── TicketFlowTrendChart.tsx # Incident flow timeline chart
│   │   │   ├── Metrics/
│   │   │   │   └── MetricPillsBar.tsx       # 6 Telemetry metric square panels [UPH, PPR, R2R, KPI, DISK, MEM]
│   │   │   ├── Services/
│   │   │   │   └── RightServicesBoxes.tsx   # 6 Subsystem service boxes [Butler, Bridge, Elastic, Platform, Influx, Logs]
│   │   │   ├── Tickets/
│   │   │   │   └── RecentTicketsTable.tsx   # Searchable incident table with triage filters
│   │   │   ├── SiteNotes/
│   │   │   │   └── SiteNotesView.tsx        # VM IPs, CEM contact, deployment info & persistent notes
│   │   │   ├── AlertPool/
│   │   │   │   └── AlertPoolView.tsx        # Active alert management pool
│   │   │   ├── Influx/
│   │   │   │   └── TotalCpusStatPanel.tsx   # Live CPU telemetry from InfluxDB
│   │   │   ├── Grafana/
│   │   │   │   ├── ActiveDashboardViewer.tsx# Live Grafana dashboard embed & metric pills
│   │   │   │   ├── EmbeddedMiniBrowser.tsx  # In-frame mini browser viewer
│   │   │   │   └── MiniBrowserModal.tsx     # Focused mini-browser modal dialog
│   │   │   └── Admin/
│   │   │       ├── AdminEmbedModal.tsx      # Admin panel management modal
│   │   │       └── EditDashboardLinkModal.tsx # 12 direct link configuration modal
│   │   ├── context/
│   │   │   ├── DashboardContext.tsx   # Central reactive application state
│   │   │   └── useDashboard.ts        # Typed context hook
│   │   ├── scenes/
│   │   │   └── SamsAtlDashboard.tsx   # Postgres telemetry scene view
│   │   ├── types/
│   │   │   ├── dashboard.ts           # Core dashboard interfaces
│   │   │   ├── sites.ts               # Enterprise sites catalog (109 sites) & categorizations
│   │   │   └── twelveLinks.ts         # 12 telemetry & metric panel keys
│   │   ├── utils/
│   │   │   ├── openMiniBrowser.ts     # Standalone popup mini-browser helper
│   │   │   └── proxyUrl.ts            # URL normalization & reverse-proxy routing
│   │   ├── App.tsx                    # Executive Operations layout
│   │   ├── main.tsx                   # React bootstrap
│   │   └── index.css                  # Tailored industrial CSS & scrollbars
│   ├── nginx.conf                     # Production Nginx reverse-proxy & SPA config
│   ├── Dockerfile                     # Multi-stage Node 20 builder + Nginx Alpine runner
│   ├── vite.config.ts
│   └── package.json
│
├── .github/
│   └── workflows/
│       └── deploy.yml                 # Automated CI/CD deployment via self-hosted runner
├── docker-compose.yml                 # Multi-container orchestration (gods-eye-net)
└── README.md
```

---

## 🚀 Running Locally (Development)

### 1. Start the Backend API (Port 5050)

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

This project is fully containerized and configured for zero-downtime, isolated deployment on Linux VMs (Ubuntu/Debian) alongside existing services (such as `Auto_BOT` on port 5000):

- **Host Port**: `8000` (maps to frontend Nginx container; backend runs inside private Docker network `gods-eye-net` on internal port 5050 without colliding with host port 5000).
- **Public URL**: `http://<VM_EXTERNAL_IP>:8000`
- **Container Names**: `gods-eye-frontend`, `gods-eye-backend`

### Quick Start with Docker:

```bash
# 1. Clone repository to dedicated VM folder
git clone https://github.com/adityas-god/GOD-S_EYE.git /GOD-S_EYE
cd /GOD-S_EYE

# 2. Copy and configure environment variables
cp .env.example .env

# 3. Build and launch isolated stack
docker compose up -d --build --remove-orphans

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
| `/health` | `GET` | Service health status check |
| `/api/sites` | `GET` | Flat directory of all 109 enterprise sites |
| `/api/sites/:siteId` | `GET`, `PUT` | Site intelligence, VM IPs, CEM info, deployments, and notes |
| `/api/sites/:siteId/alerts` | `GET` | Active Alert Pool for site |
| `/api/salesforce/calendar/:siteId` | `GET` | Monthly calendar severity calculations |
| `/api/salesforce/tickets/:siteId` | `GET` | Itemized incident tickets for selected site/date |
| `/api/salesforce/trends/:siteId` | `GET` | 90-day incident distribution trend data |
| `/api/grafana/panels/:siteId` | `GET` | 12 custom Grafana panel links for the site |
| `/api/grafana/panels/:siteId/:panelIndex`| `PUT` | Update/persist custom dashboard link in MongoDB Atlas |
| `/api/influx/query` | `GET` | Direct InfluxQL query execution (il-influxdb2) |
| `/api/proxy-dashboard?url=...` | `GET` | Reverse proxy to bypass iframe embedding restrictions |
