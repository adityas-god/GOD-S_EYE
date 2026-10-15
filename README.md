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
