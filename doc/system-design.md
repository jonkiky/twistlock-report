# System Design — Twistlock Container Scan Report Generator

**Version:** 2.0  
**Date:** March 24, 2026  
**Status:** Current

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Authentication](#4-authentication)
5. [Frontend Design](#5-frontend-design)
6. [Backend API Design](#6-backend-api-design)
7. [Report Generation](#7-report-generation)
8. [Data Flow](#8-data-flow)
9. [Security Design](#9-security-design)
10. [Deployment — Vercel](#10-deployment--vercel)
11. [Environment Configuration](#11-environment-configuration)
12. [Error Handling Strategy](#12-error-handling-strategy)
13. [Future Enhancements](#13-future-enhancements)

---

## 1. Architecture Overview

The application follows a **Next.js full-stack architecture**, with the React frontend and the API proxy backend co-located in a single project. This is ideal for Vercel deployment as both are served from the same deployment unit with zero additional infrastructure.

Users authenticate with their Twistlock (Prisma Cloud) username and password. The app exchanges credentials for an access token, then uses it to search repositories by project name, display results as a selectable checklist, and generate a combined `.docx` scan report for all selected repositories in a single download.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                    │
│                                                         │
│   React UI (Next.js App Router)                         │
│   - Login form (username / password)                    │
│   - Two-phase report form (search → select & generate)  │
│   - Loading / error / success states                    │
│   - Triggers file download                              │
└────────────────────┬────────────────────────────────────┘
                     │  POST /api/auth/login
                     │  POST /api/search-images
                     │  POST /api/generate-report
┌────────────────────▼────────────────────────────────────┐
│               Next.js API Routes (Server-side)          │
│                                                         │
│   /app/api/auth/login/route.ts                          │
│     → Proxy credentials to Twistlock authenticate       │
│                                                         │
│   /app/api/search-images/route.ts                       │
│     → Search repos by project, group & return tags      │
│                                                         │
│   /app/api/generate-report/route.ts                     │
│     → Resolve registries, fetch scans, build .docx      │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS requests with Bearer token
┌────────────────────▼────────────────────────────────────┐
│              Twistlock (Prisma Cloud) API               │
│              twistlock.nci.nih.gov                      │
│                                                         │
│   POST /api/v1/authenticate — exchange credentials      │
│   GET  /api/v1/registry     — search & resolve registry │
│   GET  /api/v34.03/registry — fetch vulnerability data  │
└─────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

- **No separate backend service.** Next.js API Routes (serverless functions on Vercel) proxy all Twistlock requests server-side. Credentials and tokens never reach the browser beyond React state.
- **No database.** The application is stateless. Reports are generated on demand and streamed directly to the client. Nothing is stored.
- **Client-side token management.** The access token obtained from `/api/auth/login` is held in React component state — not in cookies, localStorage, or sessionStorage. It disappears on page refresh or tab close.
- **Batch report generation.** Multiple repositories are combined into a single `.docx` in one request, avoiding sequential downloads.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | **Next.js 16** (App Router) + **React 19** | Full-stack framework with built-in API routes; first-class Vercel support |
| Styling | **Tailwind CSS** | Utility-first, fast to build clean forms; no runtime CSS-in-JS overhead |
| UI Components | **shadcn/ui** | Accessible, unstyled component primitives (Button, Input, Form, Alert) |
| Form Handling | **React Hook Form** + **Zod** | Client-side validation with schema-first approach |
| HTTP Client (server) | **Node.js native `fetch`** (Next.js built-in) | No extra dependency; available in Next.js edge/serverless runtime |
| Report Generation | **docxtemplater** + **pizzip** (npm) | Template-based `.docx` generation — fills placeholders in an existing Word template; pure JS, no native binaries or LibreOffice required |
| Language | **TypeScript** | Type safety across frontend and backend |
| Package Manager | **pnpm** | Faster installs; works well with Vercel |
| Deployment | **Vercel** | Zero-config Next.js deployments; serverless function execution matches the stateless design |

---

## 3. Project Structure

```
twistlock-report-app/
├── app/
│   ├── page.tsx                    # Root page — auth state, renders LoginForm or ReportForm
│   ├── layout.tsx                  # Root layout (font, metadata)
│   ├── globals.css                 # Global styles
│   └── api/
│       ├── auth/
│       │   └── login/
│       │       └── route.ts        # POST — authenticate with Twistlock
│       ├── search-images/
│       │   └── route.ts            # POST — search repos by project name
│       └── generate-report/
│           └── route.ts            # POST — batch report generation
├── components/
│   ├── LoginForm.tsx               # Username/password login form
│   ├── ReportForm.tsx              # Two-phase form: search → select & generate
│   ├── StatusBanner.tsx            # Success / error / info banner component
│   └── ui/                         # shadcn/ui generated components
│       ├── button.tsx
│       ├── input.tsx
│       ├── form.tsx
│       ├── label.tsx
│       └── alert.tsx
├── lib/
│   ├── twistlock.ts                # Twistlock API client (authenticate, search, resolve, scan)
│   ├── report-builder.ts           # .docx template-filling logic (single + combined)
│   ├── template.docx               # Word report template with {placeholder} tags
│   ├── validators.ts               # Zod schemas (login, search, report, batch report)
│   └── utils.ts                    # Shared utilities (date formatting, etc.)
├── types/
│   └── twistlock.ts                # TypeScript types for API responses
├── public/                         # Static assets (do NOT place template.docx here — see §7.5)
├── .env.local                      # Local dev environment variables (gitignored)
├── .env.example                    # Template for required env vars
├── vercel.json                     # Vercel config (function timeout)
├── next.config.ts                  # Next.js config
├── tsconfig.json
└── package.json
```

---

## 4. Authentication

### 4.1 Overview

Users provide their Twistlock username and password on a login screen. The application exchanges those credentials for an access token via the Twistlock `POST /api/v1/authenticate` endpoint, stores the token in the client's React state, and uses it for all subsequent API calls.

If the token expires (HTTP 401 from any Twistlock call), the user is redirected back to the login screen to re-authenticate.

### 4.2 Authentication Flow

```
Browser                          Next.js API Route              Twistlock API
  │                                    │                              │
  │  POST /api/auth/login              │                              │
  │  { username, password }            │                              │
  │ ──────────────────────────────►    │                              │
  │                                    │  POST /api/v1/authenticate   │
  │                                    │  { username, password }      │
  │                                    │  ─────────────────────────►  │
  │                                    │                              │
  │                                    │  200 { token: "eyJ..." }     │
  │                                    │  ◄─────────────────────────  │
  │                                    │                              │
  │  200 { token: "eyJ..." }           │                              │
  │ ◄──────────────────────────────    │                              │
  │                                    │                              │
  │  (stores token in React state)     │                              │
```

### 4.3 State Machine

```
┌──────────┐     login success      ┌───────────────┐
│          │ ──────────────────────► │               │
│  LOGIN   │                        │  AUTHENTICATED │
│          │ ◄────────────────────── │               │
└──────────┘     401 / logout        └───────────────┘
```

### 4.4 Login API: `POST /api/auth/login`

**File:** `app/api/auth/login/route.ts`

Proxies credentials to Twistlock. The Twistlock base URL is never exposed to the browser.

**Request:**

```json
{
  "username": "john.doe",
  "password": "s3cret"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing username or password |
| 401 | Invalid credentials (Twistlock returned 401) |
| 500 | Unexpected error |

### 4.5 Lib Function: `authenticate()`

**File:** `lib/twistlock.ts`

```typescript
export async function authenticate(
  username: string,
  password: string
): Promise<string>
```

- Sends `POST /api/v1/authenticate` with `{ username, password }` to the Twistlock API
- Returns the access token string on success
- Throws `TwistlockError(401, ...)` on bad credentials

### 4.6 Token Expiry Handling

Existing API routes (`/api/search-images`, `/api/generate-report`) already return HTTP 401 when Twistlock rejects the token. The frontend detects 401 responses, clears the token, and redirects to the login screen with a "Session expired" banner.

### 4.7 Validator: `loginFormSchema`

**File:** `lib/validators.ts`

```typescript
export const loginFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
```

---

## 5. Frontend Design

### 5.1 Page: `app/page.tsx`

The root page manages authentication state and conditionally renders either the login form or the report form:

```typescript
const [token, setToken] = useState<string | null>(null);

if (!token) {
  return <LoginForm onLogin={setToken} />;
}

return <ReportForm token={token} onSessionExpired={() => setToken(null)} />;
```

No routing is needed — the app is a single page.

### 5.2 Component: `LoginForm.tsx`

A login form with username and password fields.

```
┌─────────────────────────────────┐
│  Container Scan Report Generator│
│                                 │
│  Log in with your Twistlock     │
│  credentials to get started.    │
│                                 │
│  Username  [________________]   │
│  Password  [________________]   │
│                                 │
│  [Log In]                       │
└─────────────────────────────────┘
```

**Behavior:**

- On submit: `POST /api/auth/login` with `{ username, password }`
- On success: calls `onLogin(token)` callback to pass the token to the parent
- On failure: shows error banner (e.g., "Invalid username or password.")
- Loading state: button shows "Logging in…" and inputs are disabled
- Accepts optional `expiredMessage` prop to display a session expiry banner

### 5.3 Component: `ReportForm.tsx`

The report form uses a **two-phase workflow** managed by local state:

```
Phase 1: Search                    Phase 2: Select & Generate
┌─────────────────────────┐        ┌──────────────────────────────────────┐
│ Project Name  [C3DC    ]│        │ ☑ Select All / ☐ Deselect All       │
│ TPM           [J. Doe  ]│        │                                      │
│                         │  ───►  │ ☑ ccdi-federation-dcc  [1.2.0.10 ▾] │
│ [🔍 Search Repos]       │        │ ☑ ccdi-hub-backend     [2.1.0    ▾] │
└─────────────────────────┘        │ ☑ ccdi-hub-frontend    [3.0.1    ▾] │
                                   │ ☐ ccdi-old-service     [1.0.0    ▾] │
                                   │                                      │
                                   │ [Generate Report (3)]                │
                                   └──────────────────────────────────────┘
```

**Props:**

```typescript
interface ReportFormProps {
  token: string;
  onSessionExpired: () => void;
  onLogout: () => void;
}
```

- Token is passed as a prop (not entered in the form)
- All API calls use the `token` prop
- If any API call returns HTTP 401, calls `onSessionExpired()` to redirect to login
- A "Log out" link clears the token and returns to login

**Phase 1 — Search:** Renders project name + TPM fields, "Search Repositories" button.

**Phase 2 — Select & Generate:**

- Checklist table with one row per repository
- Tag dropdown per row (up to 5 most recent tags, sorted by `creationTime`)
- "Select All" / "Deselect All" toggle
- "Generate Report (N)" button showing count of checked repos
- "← Back to Search" link

**State:**

```typescript
type RepoSelection = {
  repo: string;
  availableTags: string[];
  selectedTag: string;
  checked: boolean;
};

const [phase, setPhase] = useState<"search" | "select">("search");
const [repos, setRepos] = useState<RepoSelection[]>([]);
```

**Generation:** Sends all checked repos+tags in a single `POST /api/generate-report` request. The server builds one combined `.docx`. The client downloads the file and shows a summary banner.

**Validator (`lib/validators.ts`):**

```typescript
export const searchFormSchema = z.object({
  projectName: z.string().min(1, "Project name is required"),
  tpm:         z.string().optional(),
});
```

### 5.4 Component: `StatusBanner.tsx`

Displays a dismissible alert banner. Accepts `type: "success" | "error" | "info"` and `message: string` props. Auto-dismisses success banners after 5 minutes.

---

## 6. Backend API Design

### 6.1 Route: `POST /api/auth/login`

See [§4.4 Login API](#44-login-api-post-apiauth-login).

### 6.2 Route: `POST /api/search-images`

**File:** `app/api/search-images/route.ts`

Searches Twistlock for all repositories matching a project name and returns grouped results with recent tags.

**Request:**

```json
{
  "projectName": "C3DC",
  "twistlockToken": "eyJ..."
}
```

**Response (200):**

```json
{
  "repositories": [
    {
      "repo": "ccdi-federation-dcc",
      "tags": [
        { "tag": "1.2.0.10", "creationTime": "2026-02-25T15:23:52.93Z" },
        { "tag": "1.2.0.9",  "creationTime": "2026-02-20T10:15:00.000Z" },
        { "tag": "1.2.0.8",  "creationTime": "2026-02-15T09:30:00.000Z" }
      ]
    },
    {
      "repo": "ccdi-hub-backend",
      "tags": [
        { "tag": "2.1.0", "creationTime": "2026-02-22T18:00:00.000Z" }
      ]
    }
  ]
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 400 | Missing or invalid input |
| 401 | Bad Twistlock token |
| 404 | No repositories found for project name |
| 500 | Unexpected error |

### 6.3 Route: `POST /api/generate-report`

**File:** `app/api/generate-report/route.ts`

Supports two modes: **batch** (primary) and **single-image** (legacy fallback).

#### Batch mode (primary)

**Request:**

```json
{
  "projectName": "C3DC",
  "tpm": "J. Doe",
  "selections": [
    { "imageName": "ccdi-federation-dcc", "imageTag": "1.2.0.10" },
    { "imageName": "ccdi-hub-backend",    "imageTag": "2.1.0" }
  ],
  "twistlockToken": "eyJ..."
}
```

**Processing:** For each selection → resolve registry → fetch scan result → build one combined `.docx` with all entries.

**Response:**

```
HTTP 200
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="{Project}_CombinedScanReport_{N}repos_{YYYYMMDD}.docx"
```

#### Single-image mode (legacy)

Falls back to `reportFormSchema` if the batch schema doesn't match. Generates a report for a single `imageName` + `imageTag`.

### 6.4 Twistlock API Client: `lib/twistlock.ts`

Encapsulates all Twistlock API interactions with typed responses and error mapping.

#### `authenticate(username, password)`

Exchanges credentials for an access token via `POST /api/v1/authenticate`.

#### `searchByProject(projectName, token)`

```typescript
export async function searchByProject(
  projectName: string,
  token: string
): Promise<ProjectSearchResult[]>
```

- Calls `GET /api/v1/registry` with `search={projectName}`
- Groups response items by `repoTag.repo`
- De-duplicates tags per repo, sorts by `creationTime` descending
- Returns top 5 tags per repository

#### `resolveRegistry(imageName, imageTag, token)`

```typescript
export async function resolveRegistry(
  imageName: string,
  imageTag: string,
  token: string
): Promise<string>
```

- Searches `GET /api/v1/registry` for the exact image+tag
- Returns the registry hostname from the matching result
- Throws on auth failure, image not found, or non-200

#### `getScanResult(registry, imageName, imageTag, token)`

```typescript
export async function getScanResult(
  registry: string,
  imageName: string,
  imageTag: string,
  token: string
): Promise<TwistlockScanResult>
```

- Fetches `GET /api/v34.03/registry` with registry, repository, and tag parameters
- Filters results to match exact `repoTag.repo === imageName && repoTag.tag === imageTag`
- Returns the scan result with vulnerability data

---

## 7. Report Generation

**File:** `lib/report-builder.ts`  
**Libraries:** [`docxtemplater`](https://docxtemplater.com/) + [`pizzip`](https://github.com/Stuk/jszip)  
**Template:** `lib/template.docx`

The approach is **template-based**: a pre-designed Word file (`template.docx`) contains `{placeholder}` tags where data should appear. At runtime, `docxtemplater` loads the template, substitutes all placeholders with real values, and returns the filled document as an in-memory `Buffer`. No files are written to disk.

This preserves the organization's existing Word formatting, branding, headers, and table structure without replicating it in code. The template can be updated by any Word user without touching the application.

### 7.1 Template Placeholder Tags

Open `lib/template.docx` in Word and insert these tags exactly as shown inside the appropriate table cells and paragraphs:

**Project Details table:**

```
{projectName}
{tpm}
{reportDate}
```

**Microservice Release Details table:**

```
{microserviceName}
{imageTag}
```

In batch/combined mode, the application programmatically injects `{#microservices}...{/microservices}` loop markers around `{microserviceName}` and `{imageTag}` in the template XML so each entry gets its own table row.

**Additional single-image fields (used in legacy single-report mode):**

```
{imageName}
{registry}
{scanDate}
{distro}
{totalVulnerabilities}
```

**Security Scan Findings table (repeating rows):**

The first data row of the findings table contains these five cell placeholders. The loop markers cause `docxtemplater` to repeat the row for every vulnerability:

| Cell | Placeholder |
|---|---|
| Microservice Name | `{#vulnerabilities}{imageName}` |
| CVE Identifier | `{cve}` |
| Severity | `{severity}` |
| Date Identified | `{dateIdentified}` |
| Jira Ticket | `{jiraTicket}{/vulnerabilities}` |

> **Note:** The `{#vulnerabilities}` open-loop tag is prepended to the first cell and `{/vulnerabilities}` is appended to the last cell so the entire table row repeats per vulnerability entry.

### 7.2 Combined Report (`buildCombinedReport`)

For batch requests, `buildCombinedReport()` is used:

```typescript
export interface ImageScanEntry {
  imageName: string;
  imageTag: string;
  scanResult: TwistlockScanResult;
}

export interface CombinedReportInput {
  projectName?: string;
  tpm?: string;
  reportDate: Date;
  entries: ImageScanEntry[];
}
```

- **Microservice Release Details:** Each entry (repo + tag) gets its own row via the programmatically injected `{#microservices}...{/microservices}` loop (`injectMicroservicesLoop()` modifies the template XML at runtime)
- **Security Scan Findings:** Vulnerabilities from all entries are merged into one flat array, sorted by severity (critical → high → medium → low)
- Each vulnerability row includes the `imageName` it belongs to

### 7.3 Single Report (`buildReport`)

For legacy single-image requests, `buildReport()` fills the template with data for one image.

### 7.4 Severity Sort Order

```typescript
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

vulnerabilities.sort((a, b) =>
  (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
);
```

### 7.5 Vercel Compatibility Notes

#### Template file bundling

Vercel's serverless function bundler only includes files that are statically imported via JS/TS. A `.docx` file read with `fs.readFileSync` is **not** auto-included. Add the following to `next.config.ts` to explicitly bundle the template:

```typescript
// next.config.ts
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/generate-report": ["./lib/template.docx"],
    },
  },
};
export default nextConfig;
```

> **Why not `public/`?** Files in `public/` are served as static HTTP assets, making `template.docx` publicly downloadable at `/template.docx`. Keeping it in `lib/` and using `outputFileTracingIncludes` avoids that exposure.

#### Node.js runtime requirement

`docxtemplater`, `pizzip`, and `fs` require the **Node.js runtime**. The Edge runtime does not support these APIs. Ensure the API route does **not** declare `export const runtime = 'edge'`. The default Next.js App Router runtime is Node.js, so no action is needed unless that line is added in future.

---

## 8. Data Flow

### 8.1 Authentication

```
User opens app
      │
      ▼
App state: token = null → render LoginForm
      │
      ▼
User enters username + password, clicks "Log In"
      │
      ▼
POST /api/auth/login { username, password }
      │
      ▼
Server: POST Twistlock /api/v1/authenticate
      │
      ├─ 401 → return 401 { error: "Invalid username or password" }
      ├─ non-200 → return 500 { error: "..." }
      │
      ▼
Server returns { token } → App state: token = "eyJ..."
      │
      ▼
App renders ReportForm (token passed as prop)
```

### 8.2 Search & Report Generation

```
User enters project name + TPM
      │
      ▼
POST /api/search-images { projectName, twistlockToken }
      │
      ▼
Server: GET Twistlock /api/v1/registry?search={projectName}
      │
      ▼
Server: Group by repo, sort tags by creationTime desc, return top 5
      │
      ▼
Client: Display repo checklist (all checked, most recent tag selected)
      │
      ▼
User selects/deselects repos, changes tags
      │
      ▼
Click "Generate Report"
      │
      ▼
POST /api/generate-report  (batch: all selected repo+tags)
      │
      ▼
Server: For each selection → resolve registry → fetch scan result
      │
      ├─ 401 on any call → return 401 → Client clears token, shows login
      ├─ no match → return 404
      ├─ non-200 → return 502
      │
      ▼
Server: Build single combined .docx with all repo sections
      │
      ▼
Client: Download one .docx file
      │
      ▼
Show summary banner: "Report generated with N repositories"
```

### 8.3 Session Expiry

```
Any API call returns 401
      │
      ▼
Client: onSessionExpired() → clear token state
      │
      ▼
App renders LoginForm with banner: "Your session has expired. Please log in again."
```

---

## 9. Security Design

| Concern | Mitigation |
|---|---|
| Credential handling | Username and password are sent once to the server, forwarded to Twistlock, and immediately discarded. Never logged or persisted. |
| Token storage | Token lives only in React component state (memory) — not in localStorage, sessionStorage, or cookies. Disappears on page refresh or tab close. |
| Server-side credential exchange | The Twistlock base URL and authentication endpoint are never exposed to the browser. All credential exchange happens through the Next.js API route. |
| Token in URLs | The token is always sent in POST request bodies, never as a query parameter |
| Token in server logs | API routes explicitly avoid logging tokens; structured logging should redact the `twistlockToken` key |
| Input injection | All user inputs are validated via Zod schemas (type + min-length); inputs used only as query parameters (URL-encoded), never interpolated into shell commands or SQL |
| SSRF | The Twistlock base URL is hardcoded in `lib/twistlock.ts`; user input is never used to construct the hostname |
| Report content | The report is generated purely from data returned by the Twistlock API; no user-supplied content is written verbatim into executable contexts |
| HTTPS | Vercel enforces HTTPS on all deployments; the app never operates over plain HTTP. All traffic between browser, Next.js server, and Twistlock API is over HTTPS. |
| Short-lived tokens | Twistlock tokens have a built-in expiry. The app does not attempt to extend or refresh them — it asks the user to log in again. |

---

## 10. Deployment — Vercel

### 10.1 Why Vercel

- **Zero-config Next.js support**: Vercel detects Next.js projects automatically and configures build and routing.
- **Serverless functions**: Each API route runs as an isolated serverless function — matches the stateless, on-demand nature of report generation.
- **Managed HTTPS and CDN**: TLS termination and static asset caching are handled automatically.
- **Preview deployments**: Every pull request gets a unique preview URL, making QA review straightforward.

### 10.2 Deployment Steps

**Prerequisites:**
- A Vercel account at [vercel.com](https://vercel.com)
- The project in a Git repository (GitHub, GitLab, or Bitbucket)

**Step 1 — Push project to GitHub:**

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<org>/twistlock-report-app.git
git push -u origin main
```

**Step 2 — Import project into Vercel:**

1. Log in to [vercel.com/dashboard](https://vercel.com/dashboard).
2. Click **"Add New Project"** → **"Import Git Repository"**.
3. Select the repository.
4. Vercel auto-detects Next.js. Accept the default build settings:
   - Framework Preset: **Next.js**
   - Build Command: `pnpm build`
   - Output Directory: `.next`
   - Install Command: `pnpm install`

**Step 3 — Configure environment variables in Vercel:**

Add `TWISTLOCK_BASE_URL` if the Twistlock instance URL differs from the default. No other secrets are required — the token is obtained per-session via user login.

**Step 4 — Deploy:**

Click **"Deploy"**. Vercel builds and deploys. Subsequent pushes to `main` trigger automatic redeployments.

### 10.3 Serverless Function Configuration

The report generation function may take longer than the Vercel default timeout (10 seconds) when the Twistlock API is slow. Configure a higher timeout in `vercel.json`:

```json
{
  "functions": {
    "app/api/generate-report/route.ts": {
      "maxDuration": 60
    }
  }
}
```

> **Note:** Maximum function duration on Vercel's **Hobby** plan is 60 seconds. The **Pro** plan supports up to 300 seconds. For enterprise environments with slow API responses, the Pro plan is recommended.

### 10.4 Custom Domain (Optional)

To serve the app on a custom domain (e.g., `scan-report.nci.nih.gov`):

1. **Vercel Dashboard → Project → Settings → Domains**
2. Add the custom domain.
3. Update the DNS registrar to point to Vercel's nameservers or add the provided CNAME/A record.
4. Vercel automatically provisions a TLS certificate via Let's Encrypt.

### 10.5 Preview vs. Production Environments

| Branch | Vercel Environment | URL |
|---|---|---|
| `main` | Production | `https://twistlock-report-app.vercel.app` (or custom domain) |
| Any PR branch | Preview | `https://twistlock-report-app-<hash>.vercel.app` |
| `develop` (optional) | Preview | Configurable as a named environment |

---

## 11. Environment Configuration

`.env.example` (commit this; `.env.local` is gitignored):

```bash
# Optional: Override the Twistlock base URL for testing against a staging instance
# TWISTLOCK_BASE_URL=https://twistlock.nci.nih.gov
```

For local development:

```bash
cp .env.example .env.local
pnpm dev
# App runs at http://localhost:3000
```

---

## 12. Error Handling Strategy

### Server-side (`lib/twistlock.ts`)

A custom `TwistlockError` class carries an HTTP status code and user-facing message:

```typescript
export class TwistlockError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "TwistlockError";
  }
}
```

The API routes catch this and map it to the appropriate HTTP response:

```typescript
try {
  // ... workflow
} catch (err) {
  if (err instanceof TwistlockError) {
    return Response.json({ error: err.message }, { status: err.statusCode });
  }
  console.error("Unexpected error:", err);
  return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
}
```

### Client-side

Both `LoginForm` and `ReportForm` read the `error` field from JSON error responses and display it via `<StatusBanner />`:

```typescript
if (!response.ok) {
  const { error } = await response.json();
  setStatus({ type: "error", message: error ?? "An unexpected error occurred." });
  return;
}
```

HTTP 401 responses in `ReportForm` trigger `onSessionExpired()` to redirect to login.

---

## 13. Future Enhancements

- **Token expiry detection via JWT decode.** Parse the JWT `exp` claim client-side to proactively warn the user before the token expires, rather than waiting for a 401.
- **Session persistence.** Optionally store the token in an encrypted HTTP-only cookie to survive page reloads (requires careful CSRF protection).
- **SSO integration.** Support organizational single sign-on via SAML/OIDC if the Twistlock instance supports it.
- **Project name autocomplete.** Cache known project prefixes for faster search.
- **Saved project configurations.** Remember project-to-repo mappings for repeat users.
- **Parallel generation.** Generate reports concurrently (with rate limiting) for faster batch processing.

### HTTP Status Code Mapping

| Scenario | HTTP Status | User-facing Message |
|---|---|---|
| Invalid form input | 400 | "Invalid input. Please check all fields." |
| Bad / expired token | 401 | "Authentication failed. Please check your Twistlock token." |
| Image not found | 404 | "No scan record found for `{image}:{tag}`. Verify the image name and tag." |
| Scan data unavailable | 404 | "No scan data available for this image." |
| Twistlock API error | 502 | "The Twistlock API returned an error: HTTP {code}." |
| Unexpected server error | 500 | "An unexpected error occurred. Please try again." |
