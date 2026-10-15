# Insight Hub — Backend Service

A dedicated backend service handling **Salesforce Case & Site synchronizations**, **MongoDB persistence**, and **Real-Time Webhook streaming** for Insight Hub.

---

## 🛠 Features

1. **Per-Site Salesforce Cases**:
   - Fetches all open cases that are **NOT on hold** (`Status != 'Closed' AND Status != 'On Hold'`) for any specific site or customer account.
   - Automatically matches on Account Name, ServiceNow Site Name (`Snow_Sitename__c`), Customer Input (`Site_Name_Customer_Input__c`), and Impacted Sites (`Impacted_Sites__c`).

2. **Salesforce Org Site Synchronization**:
   - Queries the GreyOrange Salesforce org database for all live Accounts and case-referenced sites.
   - Configures and persists them directly into **MongoDB**.

3. **Real-Time Webhook Synchronization**:
   - Endpoint: `/api/webhooks/salesforce`
   - Supports **Salesforce Outbound Messages (SOAP/XML)** with auto-acknowledgment (`<Ack>true</Ack>`).
   - Supports **Salesforce Apex / Flow HTTP Callout (JSON)**.
   - Pushes live updates immediately to all connected browsers via Server-Sent Events (`/api/webhooks/events`).

4. **Resilient Data Layer**:
   - Mongoose-powered MongoDB data layer with automatic in-memory fallback if the MongoDB daemon is offline, ensuring zero downtime.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment (`.env`)
The `.env` file is pre-configured with:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/insight_hub
CLIENT_ORIGIN=http://localhost:8080

SF_CLIENT_ID=your_salesforce_client_id
SF_CLIENT_SECRET=your_salesforce_client_secret
SF_INSTANCE_URL=https://greyorangeorg.my.salesforce.com
SF_API_VERSION=v59.0
```

### 3. Start Backend Server
```bash
npm run dev
# or: node server.js
```
The server will start at `http://localhost:5000`.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health status of MongoDB and Salesforce connections |
| `GET` | `/api/sites` | List all sites configured in MongoDB |
| `GET` | `/api/sites/:siteId` | Get details for a single site |
| `GET` | `/api/sites/:siteId/cases` | Get all open cases (not on hold) for this specific site |
| `POST` | `/api/sites/sync-salesforce` | Retrieve exact sites from GreyOrange SF org & store in MongoDB |
| `GET` | `/api/cases` | List all open cases across all sites |
| `POST` | `/api/webhooks/salesforce` | Webhook receiver for real-time Salesforce updates |
| `GET` | `/api/webhooks/events` | Server-Sent Events (SSE) stream for live browser push |

---

## 🔗 Configuring Salesforce Webhooks

To enable real-time case sync from Salesforce:
1. In Salesforce Setup, go to **Workflow Rules** or **Flow Builder**.
2. Create an Outbound Message or HTTP Callout on the `Case` object triggered when `Status` is changed or a new Case is created.
3. Set the Endpoint URL to:
   ```
   https://<your-public-url>/api/webhooks/salesforce
   ```
4. Include fields: `Id`, `CaseNumber`, `Status`, `AccountId`, `Snow_Sitename__c`, `Account_Name__c`, `Is_Site_100_Down__c`.
5. The backend will parse the incoming payload, update MongoDB, and stream the update to the frontend instantly.
