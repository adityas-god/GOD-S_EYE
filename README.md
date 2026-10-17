# 👁️ GOD'S EYE - Operations & Incident Intelligence Dashboard

A production-grade, real-time monitoring and incident dashboard for multi-site operations. Integrates directly with Salesforce, Opsgenie, and MongoDB to display live incident metrics, severity categorization (`SEV 1 URGENT`, `SEV 2 URGENT`), and site health.

---

## 🏗️ Architecture & Server Ports

The application runs as a containerized multi-tier stack orchestrated by Docker Compose:

```
                  Internet / Internal Network
                               │
                        Port 8081 (HTTP)
                               ▼
    ┌────────────────────────────────────────────────────────┐
    │  Frontend Container: gods-eye-frontend (Nginx Alpine)  │
    │  - Serves React Vite SPA on /                          │
    │  - Reverse proxies /api/ -> backend:5000               │
    │  - Reverse proxies /api/webhooks/events -> backend     │
    │  - Reverse proxies /health -> backend:5000/health      │
    └──────────────────────────┬─────────────────────────────┘
                               │ Internal Docker Bridge (gods-eye-net)
                               ▼
    ┌────────────────────────────────────────────────────────┐
    │  Backend Container: gods-eye-backend (Node.js 22)      │
    │  - Port 5000 (Internal, not exposed to host)           │
    │  - Connects to Salesforce SOQL API                     │
    │  - Connects to MongoDB                                 │
    └────────────────────────────────────────────────────────┘
```

### 🔌 Port Allocation & Conflict Prevention

| Port | Service | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **8081** | **Frontend (Nginx)** | **Public / VM Host** | Main dashboard web interface (`http://<VM_IP>:8081`). Configured on `8081` to avoid conflicting with other VM services like Auto_BOT (`5000`) and InfluxQL (`8080`). |
| **5000** | **Backend API** | **Internal Only** | Express.js API. Isolated within the `gods-eye-net` Docker network. Accessible to the outside world solely via Nginx reverse proxy. |

---

## ⚡ CI/CD Deployment Pipeline (`.github/workflows/deploy.yml`)

The repository includes an automated CI/CD pipeline triggered on every `git push` to the `main` branch.

### 🔄 How Automated Deployment Works:
1. **Trigger**: You commit and push code changes to `main` (`git push origin main`).
2. **Runner**: A GitHub Actions **self-hosted Linux runner** running as a background service on the VM picks up the job immediately.
3. **Synchronization**:
   - The runner switches to the deployment directory on the VM (`/GOD-S_EYE` or `~/GOD-S_EYE`).
   - Executes `git fetch origin main` and `git reset --hard origin/main` to pull the latest code.
4. **Environment & Secrets**:
   - The `.env` file on the VM is **preserved** (it is never overwritten by Git because it is git-ignored).
   - If GitHub Repository Secrets (`SF_CLIENT_ID`, `SF_CLIENT_SECRET`, etc.) are configured, they can also be automatically synced.
5. **Zero-Downtime Container Rebuild**:
   - `docker compose build --network host` builds the updated frontend bundle and backend image.
   - `docker compose up -d --remove-orphans` replaces the containers seamlessly.
6. **Health Verification**:
   - The runner polls `http://127.0.0.1:8081/health` for up to 60 seconds.
   - Upon a `200 OK`, deployment completes, and changes are **live immediately** on `http://<VM_IP>:8081`.

---

## 🖥️ Setting Up the GitHub Actions Self-Hosted Runner on the VM

If the self-hosted runner is not yet installed on the Linux VM, follow these steps once:

1. Go to your GitHub repository:
   **`https://github.com/adityas-god/GOD-S_EYE`** -> **Settings** -> **Actions** -> **Runners** -> **New runner**.
2. Select **OS: Linux**, **Architecture: x64**.
3. In your VM SSH terminal, run the commands displayed by GitHub:
   ```bash
   # Download and unpack runner
   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64-2.321.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.321.0.tar.gz

   # Configure runner (enter runner token provided in GitHub UI)
   ./config.sh --url https://github.com/adityas-god/GOD-S_EYE --token <YOUR_RUNNER_TOKEN>

   # Install and run as a systemd background service
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

---

## 🛠️ Manual Deployment on the VM (Fallback)

If you ever need to manually pull and redeploy directly on the VM:

```bash
cd /GOD-S_EYE    # Or ~/GOD-S_EYE
chmod +x deploy.sh
./deploy.sh
```

---

## 🔐 Managing Production Secrets on the VM

Because secrets are git-ignored, your production credentials must exist in `.env` on the VM:

Edit the `.env` file once on the VM:
```bash
nano /GOD-S_EYE/.env
```
Ensure it contains:
```env
HOST_PORT=8081
PORT=5000
NODE_ENV=production

# Salesforce Integration
SF_LOGIN_URL=https://login.salesforce.com
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=your_salesforce_consumer_key_here
SF_CLIENT_SECRET=your_salesforce_consumer_secret_here
SF_API_VERSION=v59.0
```

Once saved on the VM, subsequent Git pushes will **never** alter or overwrite these secrets.

---

## 🧭 Future Roadmap & Architectural Plan: Operations Metrics Cockpit & AI Analytics Engine

> **Status**: Architected & Documented for Future Re-Enablement.  
> **Objective**: Provide leadership and site reliability engineers with a god-level operational cockpit that uncovers where the organization is lagging, separated into actionable buckets and driven by natural language AI analytics.

---

### 1. Dual Operational Buckets Architecture

| Operational Bucket | Color Code | Data Source | SLA & Criticality Target | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **🔴 Incidents Bucket** | `#ef4444` (Crimson) | Salesforce Service Cloud (`Case` object) | **Contractual SLA Deadlines**<br>Sev 1: 2 hrs, Sev 2: 4 hrs, Sev 3: 24 hrs, Sev 4: 72 hrs | Tracks real customer-facing warehouse outages, production halts, and critical hardware downtime. |
| **🟡 Alerts Bucket** | `#eab308` (Amber) | Opsgenie / Automated Telemetry Stream | **Signal-to-Noise Reduction**<br>De-duplication, suppression, hysteresis | Captures automated machine alarms, heartbeat drops, charging/docking warnings, and sensor triggers before they become production outages. |

---

### 2. The 6 Organizational Lagging Indicators

1. **SLA Compliance & MTTR Bottlenecks**:
   - Compares incident arrival timestamp (`CreatedDate`) vs resolution timestamp (`ClosedDate`).
   - Flags breaches against contractual limits:
     $$\text{Breach Condition} = (\text{Duration} > \text{Target SLA})$$
   - Computes organization-wide Mean Time to Resolve (MTTR) across Sev 1, Sev 2, Sev 3, Sev 4.

2. **Top Chronic Problem Sites ("Hall of Churn")**:
   - Computes weighted Churn Score per facility:
     $$\text{Churn Score} = (10 \times \text{Sev 1}) + (5 \times \text{Sev 2}) + (2 \times \text{Sev 3}) + (15 \times \text{IsDown}) + (4 \times \text{Breaches}) + (0.3 \times \text{Alerts})$$
   - Highlights repeated hardware failures at specific distribution centers (e.g., Kenco, Sam's Club, DHL, Essilor Luxottica).

3. **Alert Fatigue & Telemetry Noise Ratio**:
   - Calculates the ratio of automated telemetry alarms to true customer tickets:
     $$\text{Noise Percentage} = \frac{\text{Total Alerts}}{\text{Total Alerts} + \text{Total Incidents}} \times 100$$
   - Categorizes telemetry triggers (Heartbeat/Comms, Charger/Battery, Vision/Sensors, Navigation Obstacles, Server Infrastructure).

4. **Stale Backlog Aging Pipeline**:
   - Groups unresolved tickets into 4 time buckets:
     - 🟢 `< 24 Hours` (Fresh triage)
     - 🔵 `24 – 72 Hours` (In progress)
     - 🟠 `3 – 7 Days` (Stagnant backlog)
     - 🔴 `> 7 Days` (Chronic debt / SLA disaster)

5. **Robotic Product Line Fragility**:
   - Segregates incident frequency and Sev 1 downtime across GreyOrange product families:
     - **RMS** (Ranger Move / Butler AGVs)
     - **Case Pick** (AMR carton handling)
     - **RA** (Robotic Arm picking)
     - **RIL** (Ranger In-Line conveyors)
     - **Shuttle Systems**

6. **Shift Continuity & Peak Influx Heatmap**:
   - Maps case creation across the 24-hour cycle:
     - **Morning Shift**: 06:00 – 13:59
     - **Evening Shift**: 14:00 – 21:59
     - **Night Shift**: 22:00 – 05:59
   - Reveals shift handover spikes and off-hour coverage gaps.

---

### 3. Decoupled AI Analytics Engine ("Ask God's Eye AI")

```
                                      [User Query: "Show Sev 1 SLA breaches"]
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  POST /api/metrics/ai-query  │
                                          └──────────────┬───────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │   Query Intent Classifier    │
                                          │   (Regex & Heuristic Match)  │
                                          └──────────────┬───────────────┘
                                                         │
                              ┌──────────────────────────┴──────────────────────────┐
                              ▼                                                     ▼
               ┌─────────────────────────────┐                       ┌─────────────────────────────┐
               │    Engine Mode 1: Local     │                       │    Engine Mode 2: Gemini    │
               │   Mathematical Synthesizer  │                       │   Generative Reasoning API  │
               │  - Zero network latency     │                       │  - Executive summaries      │
               │  - Deterministic charts     │                       │  - Actionable SRE guidance  │
               │  - Never crashes/times out  │                       │  - 3.5s timeout abort guard │
               └──────────────┬──────────────┘                       └──────────────┬──────────────┘
                              │                                                     │
                              └──────────────────────────┬──────────────────────────┘
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │ Dynamic Visual Widget Schema │
                                          │ (Bar / Donut / KPI / Table)  │
                                          └──────────────────────────────┘
```

#### Supported Conversational Intents:
- **Greeting & Status**: `"hii"`, `"hello"`, `"help"`, `"status"` $\rightarrow$ Operational Cockpit Briefing.
- **SLA & MTTR**: `"Show Sev 1 SLA breaches"`, `"Which cases missed SLA?"` $\rightarrow$ Severity breakdown chart.
- **Chronic Facilities**: `"Top chronic problem sites"`, `"Worst downtime"` $\rightarrow$ Ranked churn bar chart.
- **Alert Noise**: `"Alert fatigue ratio"`, `"Telemetry noise"` $\rightarrow$ Donut chart of alert triggers.
- **Shift Transition**: `"Night vs day shifts"`, `"Peak arrival hours"` $\rightarrow$ Shift distribution comparison.
- **Product Lines**: `"RMS vs Case Pick"`, `"Robotic arm failures"` $\rightarrow$ Product line breakdown.
- **Facility Deep-Dive**: `"Kenco status"`, `"Essilor Luxottica"` $\rightarrow$ Site-specific incident records and health.

---

### 4. API Endpoints Specification (For Re-Activation)

- `GET /api/metrics?timeframe=7d&bucket=incidents`: Returns computed SLA stats, chronic sites, noise ratios, and backlog aging.
- `POST /api/metrics/ai-query`: Accepts `{ prompt: string, timeframe: string, bucket: string }` and returns dynamic widget JSON.
- `GET /api/metrics/ai-suggestions`: Returns recommended quick-prompt chips for operational discovery.

---

### 5. Steps to Re-Enable in the Future

1. Re-mount `aiMetricsRouter` in [`backend/server.js`](file:///c:/Users/aditya.s.ctr/Downloads/GOD-S_EYE-main/GOD-S_EYE-main/backend/server.js) at `/api/metrics`.
2. Re-register `/metrics` route in [`Frontend/src/routes/metrics.tsx`](file:///c:/Users/aditya.s.ctr/Downloads/GOD-S_EYE-main/GOD-S_EYE-main/Frontend/src/routes/metrics.tsx) and TanStack router tree.
3. Add navigation link back into [`Frontend/src/components/dashboard-shell.tsx`](file:///c:/Users/aditya.s.ctr/Downloads/GOD-S_EYE-main/GOD-S_EYE-main/Frontend/src/components/dashboard-shell.tsx).
4. Configure standard Google AI Studio API key (`AIzaSy...`) in VM `.env` under `GEMINI_API_KEY`.

