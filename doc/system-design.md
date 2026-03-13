# System Design — Twistlock Container Scan Report Generator

**Version:** 1.0  
**Date:** March 12, 2026  
**Status:** Draft

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Frontend Design](#4-frontend-design)
5. [Backend API Design](#5-backend-api-design)
6. [Report Generation](#6-report-generation)
7. [Data Flow](#7-data-flow)
8. [Security Design](#8-security-design)
9. [Deployment — Vercel](#9-deployment--vercel)
10. [Environment Configuration](#10-environment-configuration)
11. [Error Handling Strategy](#11-error-handling-strategy)

---

## 1. Architecture Overview

The application follows a **Next.js full-stack architecture**, with the React frontend and the API proxy backend co-located in a single project. This is ideal for Vercel deployment as both are served from the same deployment unit with zero additional infrastructure.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                    │
│                                                         │
│   React UI (Next.js App Router)                         │
│   - Input form                                          │
│   - Loading / error / success states                    │
│   - Triggers file download                              │
└────────────────────┬────────────────────────────────────┘
                     │  POST /api/generate-report
                     │  (JSON body: form inputs)
┌────────────────────▼────────────────────────────────────┐
│               Next.js API Route (Server-side)           │
│               /app/api/generate-report/route.ts         │
│                                                         │
│   1. Validate inputs                                    │
│   2. Call Twistlock API — Step 1 (resolve registry)     │
│   3. Call Twistlock API — Step 2 (get scan results)     │
│   4. Generate .docx from template using docxtemplater    │
│   5. Stream .docx file back to browser                  │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS requests with Bearer token
┌────────────────────▼────────────────────────────────────┐
│              Twistlock (Prisma Cloud) API               │
│              twistlock.nci.nih.gov                      │
│                                                         │
│   GET /api/v1/registry     — resolve registry hostname  │
│   GET /api/v34.03/registry — fetch vulnerability data   │
└─────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

- **No separate backend service.** Next.js API Routes (serverless functions on Vercel) proxy all Twistlock requests server-side. The Twistlock token never reaches the browser.
- **No database.** The application is stateless. Reports are generated on demand and streamed directly to the client. Nothing is stored.
- **No authentication layer** (for initial version). The Twistlock token supplied by the user acts as the credential. If org-level access control is required later, Vercel supports integration with identity providers.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | **Next.js 14** (App Router) + **React 18** | Full-stack framework with built-in API routes; first-class Vercel support |
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
│   ├── page.tsx                    # Home page — renders the input form
│   ├── layout.tsx                  # Root layout (font, metadata)
│   └── api/
│       └── generate-report/
│           └── route.ts            # POST handler — proxy + report generation
├── components/
│   ├── ReportForm.tsx              # Form component with all input fields
│   ├── StatusBanner.tsx            # Success / error banner component
│   └── ui/                         # shadcn/ui generated components
│       ├── button.tsx
│       ├── input.tsx
│       ├── form.tsx
│       └── alert.tsx
├── lib/
│   ├── twistlock.ts                # Twistlock API client functions
│   ├── report-builder.ts           # .docx template-filling logic (docxtemplater)
│   ├── template.docx               # Word report template with {placeholder} tags
│   ├── validators.ts               # Zod schema for form inputs
│   └── utils.ts                    # Shared utilities (date formatting, etc.)
├── types/
│   └── twistlock.ts                # TypeScript types for API responses
├── public/                         # Static assets (do NOT place template.docx here — see §6.3)
├── .env.local                      # Local dev environment variables (gitignored)
├── .env.example                    # Template for required env vars
├── vercel.json                     # Vercel config (function timeout)
├── next.config.ts                  # Next.js config
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. Frontend Design

### 4.1 Page: `app/page.tsx`

The root page renders the `<ReportForm />` component centered on screen with a simple card layout. No routing is needed — the app is a single page.

### 4.2 Component: `ReportForm.tsx`

Manages form state using **React Hook Form** and **Zod** validation.

**Form schema (`lib/validators.ts`):**

```typescript
import { z } from "zod";

export const reportFormSchema = z.object({
  projectName:       z.string().optional(),
  tpm:               z.string().optional(),
  microserviceName:  z.string().min(1, "Microservice name is required"),
  imageName:         z.string().min(1, "Image name is required"),
  imageTag:          z.string().min(1, "Image tag is required"),
  twistlockToken:    z.string().min(1, "Twistlock token is required"),
});

export type ReportFormValues = z.infer<typeof reportFormSchema>;
```

**Submit handler flow:**

1. Validate form (Zod schema). Show inline errors if invalid.
2. Set button state → `loading`.
3. `POST /api/generate-report` with JSON body.
4. On HTTP 200: read `Content-Disposition` header for filename, trigger `<a download>` using a Blob URL. Show success banner.
5. On HTTP 4xx/5xx: parse JSON error body, show error banner. Reset button to default.

**Triggering the file download from a fetch response:**

```typescript
const response = await fetch("/api/generate-report", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(values),
});

if (!response.ok) {
  const { error } = await response.json();
  throw new Error(error);
}

const blob = await response.blob();
const filename = response.headers.get("Content-Disposition")
  ?.split("filename=")[1] ?? "ScanReport.docx";
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

### 4.3 Component: `StatusBanner.tsx`

Displays a dismissible success or error alert above the form. Accepts `type: "success" | "error"` and `message: string` props. Auto-dismisses success banners after 5 minutes.

---

## 5. Backend API Design

### 5.1 Route: `POST /api/generate-report`

**File:** `app/api/generate-report/route.ts`

**Request body (JSON):**

```typescript
{
  projectName?:     string;   // optional
  tpm?:             string;   // optional
  microserviceName: string;
  imageName:        string;
  imageTag:         string;
  twistlockToken:   string;   // used for outbound API calls only; never logged
}
```

**Success response:**

```
HTTP 200
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="{ProjectName}_{ImageName}_{Tag}_ScanReport_{YYYYMMDD}.docx"

<binary .docx file body>
```

**Error response:**

```
HTTP 400 | 401 | 404 | 502
Content-Type: application/json

{ "error": "<human-readable message>" }
```

**Handler pseudocode:**

```typescript
export async function POST(request: Request) {
  // 1. Parse and validate body
  const body = await request.json();
  const parsed = reportFormSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  const { projectName, tpm, microserviceName, imageName, imageTag, twistlockToken } = parsed.data;

  // 2. Step 1 — resolve registry
  const registry = await resolveRegistry(imageName, imageTag, twistlockToken);
  // throws on auth failure, image not found, or non-200

  // 3. Step 2 — get scan results
  const scanResult = await getScanResult(registry, imageName, imageTag, twistlockToken);
  // throws on non-200 or missing data

  // 4. Generate .docx
  const docxBuffer = await buildReport({
    projectName, tpm, microserviceName, imageName, imageTag,
    reportDate: new Date(),
    scanResult,
  });

  // 5. Stream file to client
  const filename = `${projectName}_${imageName}_${imageTag}_ScanReport_${formatDate(new Date())}.docx`;
  return new Response(docxBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

### 5.2 Twistlock API Client: `lib/twistlock.ts`

Encapsulates the two Twistlock API calls with typed responses and error mapping.

```typescript
export async function resolveRegistry(
  imageName: string,
  imageTag: string,
  token: string
): Promise<string> {
  const encodedSearch = encodeURIComponent(`${imageName}:${imageTag}`);
  // double-encode dots and backslashes per Twistlock search syntax
  const url = `https://twistlock.nci.nih.gov/api/v1/registry` +
    `?collections=CRDC+CCDI+All+Collection&compact=true&limit=17&offset=0` +
    `&project=Central+Console&reverse=true&search=${encodedSearch}&sort=vulnerabilityRiskScore`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new TwistlockError(401, "Authentication failed. Check your Twistlock token.");
  if (!res.ok) throw new TwistlockError(res.status, `Registry lookup failed: HTTP ${res.status}`);

  const data = await res.json();
  const match = data.find((item: any) =>
    item.repoTag?.repo === imageName && item.repoTag?.tag === imageTag
  );

  if (!match) throw new TwistlockError(404, `No scan record found for ${imageName}:${imageTag}.`);
  return match.repoTag.registry;
}

export async function getScanResult(
  registry: string,
  imageName: string,
  imageTag: string,
  token: string
): Promise<TwistlockScanResult> {
  const url = `https://twistlock.nci.nih.gov/api/v34.03/registry` +
    `?registry=${encodeURIComponent(registry)}&repository=${encodeURIComponent(imageName)}&tag=${encodeURIComponent(imageTag)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) throw new TwistlockError(401, "Authentication failed. Check your Twistlock token.");
  if (!res.ok) throw new TwistlockError(res.status, `Scan result fetch failed: HTTP ${res.status}`);

  const data = await res.json();
  if (!data || data.length === 0) throw new TwistlockError(404, "No scan data available for this image.");
  return data[0];
}
```

---

## 6. Report Generation

**File:** `lib/report-builder.ts`  
**Libraries:** [`docxtemplater`](https://docxtemplater.com/) + [`pizzip`](https://github.com/Stuk/jszip)  
**Template:** `lib/template.docx`

The approach is **template-based**: a pre-designed Word file (`template.docx`) contains `{placeholder}` tags where data should appear. At runtime, `docxtemplater` loads the template, substitutes all placeholders with real values, and returns the filled document as an in-memory `Buffer`. No files are written to disk.

This preserves the organization's existing Word formatting, branding, headers, and table structure without replicating it in code. The template can be updated by any Word user without touching the application.

### 6.1 Template Placeholder Tags

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
{imageName}
{imageTag}
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

### 6.2 Report Structure

The `.docx` file contains three sections, matching the report template:

**Section 1 — Project Details**

| Field | Value |
|---|---|
| Project Name | From user input |
| TPM | From user input |
| Report Date | Current date, formatted `MMMM DD, YYYY` |

**Section 2 — Microservice Release Details**

| Field | Value |
|---|---|
| Microservice Name | From user input |
| Image Repository | From user input |
| Image Tag | From user input |
| Registry | From `repoTag.registry` |
| Scan Date | From `scanTime`, formatted `MMMM DD, YYYY` |
| OS / Distribution | From `distro` |
| Total Vulnerabilities | From `vulnerabilitiesCount` |

**Section 3 — Security Scan Findings**

One row per vulnerability, sorted: critical → high → medium → low.

| Column | Source |
|---|---|
| Microservice Name | User-supplied `imageName` |
| CVE Identifier | `.cve` |
| Severity | `.severity` (capitalized) |
| Date Identified | `.discovered` (formatted `YYYY-MM-DD`) |
| Jira Ticket | *(blank — filled in manually after download)* |

### 6.3 Severity Sort Order

```typescript
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

vulnerabilities.sort((a, b) =>
  (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
);
```

### 6.4 `report-builder.ts` Implementation

```typescript
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export async function buildReport(data: ReportInput): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "lib", "template.docx");
  const templateContent = fs.readFileSync(templatePath, "binary");

  const zip = new PizZip(templateContent);
  normalizeBrokenTemplatePlaceholders(zip); // repairs Word-split placeholder tags
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() { return ""; }, // render missing/optional values as empty string
  });

  const sortedVulns = [...(data.scanResult.vulnerabilities ?? [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

  doc.render({
    projectName:          data.projectName ?? "",
    tpm:                  data.tpm ?? "",
    reportDate:           formatDate(data.reportDate),
    microserviceName:     data.microserviceName,
    imageName:            data.imageName,
    imageTag:             data.imageTag,
    registry:             data.registry,
    scanDate:             formatDate(new Date(data.scanResult.scanTime)),
    distro:               data.scanResult.distro,
    totalVulnerabilities: data.scanResult.vulnerabilitiesCount,
    vulnerabilities: sortedVulns.map((v) => ({
      imageName:      data.imageName,
      cve:            v.cve,
      severity:       capitalize(v.severity),
      dateIdentified: v.discovered?.slice(0, 10) ?? "",
      jiraTicket:     "",
    })),
  });

  return doc.getZip().generate({ type: "nodebuffer" });
}
```

### 6.5 Vercel Compatibility Notes

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

## 7. Data Flow

```
User fills form
      │
      ▼
Client-side Zod validation (React Hook Form)
      │
      ├─ Invalid → show inline field errors, stop
      │
      ▼
POST /api/generate-report  (JSON body)
      │
      ▼
Server: validate body with Zod schema
      │
      ▼
Server: GET Twistlock /api/v1/registry  (Step 1)
      │
      ├─ 401 → return 401 { error: "Authentication failed..." }
      ├─ no match → return 404 { error: "No scan record found..." }
      ├─ non-200 → return 502 { error: "Registry lookup failed..." }
      │
      ▼
Server: extract registry hostname from response
      │
      ▼
Server: GET Twistlock /api/v34.03/registry  (Step 2)
      │
      ├─ 401 → return 401
      ├─ empty → return 404
      ├─ non-200 → return 502
      │
      ▼
Server: sort vulnerabilities by severity
      │
      ▼
Server: build .docx via docx library (in memory)
      │
      ▼
Server: stream .docx binary as HTTP 200 response
      │
      ▼
Client: receive blob → create object URL → trigger <a download>
      │
      ▼
Show success banner with "Download Again" link
```

---

## 8. Security Design

| Concern | Mitigation |
|---|---|
| Twistlock token exposure | Token is sent to the server in the POST body over HTTPS; used only for server-side outbound calls; never logged, stored, or included in responses |
| Token in server logs | API route explicitly avoids logging the token field; structured logging should redact the `twistlockToken` key |
| Input injection | All user inputs are validated via Zod schema (type + min-length); inputs used only as query parameters (URL-encoded), never interpolated into shell commands or SQL |
| SSRF | The Twistlock base URL is hardcoded in `lib/twistlock.ts`; user input is never used to construct the hostname |
| Report content | The report is generated purely from data returned by the Twistlock API; no user-supplied content is written verbatim into executable contexts |
| HTTPS | Vercel enforces HTTPS on all deployments; the app never operates over plain HTTP |
| No token persistence | The token is a request-scoped variable; it is not cached, stored in memory between requests, or written to any file/database |

---

## 9. Deployment — Vercel

### 9.1 Why Vercel

- **Zero-config Next.js support**: Vercel detects Next.js projects automatically and configures build and routing.
- **Serverless functions**: Each API route (`/api/generate-report`) runs as an isolated serverless function — matches the stateless, on-demand nature of report generation.
- **Managed HTTPS and CDN**: TLS termination and static asset caching are handled automatically.
- **Preview deployments**: Every pull request gets a unique preview URL, making QA review straightforward.

### 9.2 Deployment Steps

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

No secrets are stored server-side for this application (the Twistlock token is supplied per-request by the user). No environment variables are required for basic operation.

If optional server-side configuration is needed, add variables via:  
**Vercel Dashboard → Project → Settings → Environment Variables**

**Step 4 — Deploy:**

Click **"Deploy"**. Vercel builds and deploys. Subsequent pushes to `main` trigger automatic redeployments.

### 9.3 Serverless Function Configuration

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

### 9.4 Custom Domain (Optional)

To serve the app on a custom domain (e.g., `scan-report.nci.nih.gov`):

1. **Vercel Dashboard → Project → Settings → Domains**
2. Add the custom domain.
3. Update the DNS registrar to point to Vercel's nameservers or add the provided CNAME/A record.
4. Vercel automatically provisions a TLS certificate via Let's Encrypt.

### 9.5 Preview vs. Production Environments

| Branch | Vercel Environment | URL |
|---|---|---|
| `main` | Production | `https://twistlock-report-app.vercel.app` (or custom domain) |
| Any PR branch | Preview | `https://twistlock-report-app-<hash>.vercel.app` |
| `develop` (optional) | Preview | Configurable as a named environment |

---

## 10. Environment Configuration

`.env.example` (commit this; `.env.local` is gitignored):

```bash
# No required server-side secrets for the base application.
# Add variables here if future enhancements require them.

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

## 11. Error Handling Strategy

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

The API route catches this and maps it to the appropriate HTTP response:

```typescript
try {
  // ... workflow
} catch (err) {
  if (err instanceof TwistlockError) {
    return Response.json({ error: err.message }, { status: err.statusCode });
  }
  console.error("Unexpected error:", err); // safe — no token in this context
  return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
}
```

### Client-side (`components/ReportForm.tsx`)

The fetch call reads the `error` field from the JSON response body and passes it to `<StatusBanner />`:

```typescript
if (!response.ok) {
  const { error } = await response.json();
  setStatus({ type: "error", message: error ?? "An unexpected error occurred." });
  return;
}
```

### HTTP Status Code Mapping

| Scenario | HTTP Status | User-facing Message |
|---|---|---|
| Invalid form input | 400 | "Invalid input. Please check all fields." |
| Bad / expired token | 401 | "Authentication failed. Please check your Twistlock token." |
| Image not found | 404 | "No scan record found for `{image}:{tag}`. Verify the image name and tag." |
| Scan data unavailable | 404 | "No scan data available for this image." |
| Twistlock API error | 502 | "The Twistlock API returned an error: HTTP {code}." |
| Unexpected server error | 500 | "An unexpected error occurred. Please try again." |
