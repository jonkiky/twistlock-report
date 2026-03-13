# Twistlock Container Scan Report Generator

## 1. Purpose

This tool automates the generation of a container vulnerability scan report by integrating with the Twistlock (Prisma Cloud) API. Given a microservice image name and version, the tool retrieves the associated security scan data and populates a standardized report template — eliminating manual data entry and ensuring consistency across security reports.

---

## 2. Application Type

The tool must be delivered as a **web application** accessible via a browser. It requires no installation and must be usable by non-technical staff (e.g., TPMs, project coordinators).

### 2.1 Technology Constraints

- Must run in a modern browser (Chrome, Firefox, Edge — latest two major versions).
- The backend may be implemented in any language/framework suitable for making authenticated HTTP requests to the Twistlock API (e.g., Python/FastAPI, Node.js/Express).
- The Twistlock API token must **never** be exposed to the browser or included in client-side code. All API calls to Twistlock must be proxied through the backend.
- The generated report must be downloadable as a **Word document (.docx)** or **PDF**.

---

## 3. User Interface

### 3.1 Input Form

The home page must display a single form containing all required input fields. The form layout should be clean and clearly labeled.

| Field | UI Control | Required | Placeholder / Helper Text |
|---|---|---|---|
| Project Name | Text input | No | e.g., `CRDC CCDI` |
| TPM | Text input | No | e.g., `Jane Smith` |
| Microservice Name | Text input | Yes | e.g., `Federation DCC Service` |
| Image Name | Text input | Yes | e.g., `ccdi-federation-dcc` |
| Image Version / Tag | Text input | Yes | e.g., `1.2.0.10` |
| Twistlock Token | Password input (masked) | Yes | `Paste your Bearer token here` |

- **Project Name** and **TPM** are optional and may be left blank.
- All other fields are required. The form must prevent submission if any required field is empty.
- The Twistlock Token field must mask input (password-style) to prevent shoulder surfing.
- Inline validation messages should appear on blur (when a required field is left blank).

### 3.2 Generate Report Button

- A prominent **"Generate Report"** button must appear below the form.
- While the report is being generated, the button must be disabled and display a loading spinner with the label **"Generating…"** to prevent duplicate submissions.
- On success, the button returns to its default state and the download is triggered automatically.
- On failure, the button returns to its default state and an error banner is displayed at the top of the form.

### 3.3 Status & Feedback

| State | UI Behavior |
|---|---|
| Generating | Loading spinner on button; button disabled; status message: "Fetching scan data…" |
| Success | Success banner: "Report generated successfully."; file download triggered automatically |
| API / Auth Error | Error banner with the specific error message (e.g., "Authentication failed. Please check your Twistlock token.") |
| Image Not Found | Error banner: "No scan record found for `{image_name}:{tag}`. Verify the image name and tag." |
| Validation Error | Inline field-level error messages; form cannot be submitted |

### 3.4 Report Download

- The generated report file should be named: `{ProjectName}_{ImageName}_{Tag}_ScanReport_{YYYYMMDD}.docx` (or `.pdf`).
- The download must be triggered automatically upon successful generation.
- A **"Download Again"** link should remain visible on the success banner for 5 minutes in case the user needs to re-download.

---

## 4. User Inputs

> See Section 3.1 for the corresponding UI controls for each field.

The following inputs must be provided before the tool executes. Fields marked **optional** may be left blank.

| Field | Type | Required | Description |
|---|---|---|---|
| Project Name | String | No | Name of the project that owns the microservice |
| TPM | String | No | Full name of the Technical Project Manager |
| Microservice Name | String | Yes | Human-readable name of the microservice (used for display in the report) |
| Image Name | String | Yes | Container image repository name (e.g., `ccdi-federation-dcc`) |
| Image Version / Tag | String | Yes | The specific image tag to scan (e.g., `1.2.0.10`) |
| Twistlock Token | String | Yes | Bearer token for authenticating against the Twistlock API; treated as a secret and never logged or stored |

> **Note:** The Report Date is automatically populated with the date the tool is run. It does not need to be entered by the user.

---

## 3. Processing Workflow

The tool executes the following two API calls in sequence.

### Step 1 — Resolve Registry Hostname

The image registry hostname must be resolved before the full scan result can be retrieved. This step searches Twistlock for the image using the repository name and tag, then extracts the registry hostname from the response.

**API Call:**

```
GET https://twistlock.nci.nih.gov/api/v1/registry
  ?collections=CRDC+CCDI+All+Collection
  &compact=true
  &limit=17
  &offset=0
  &project=Central+Console
  &reverse=true
  &search={image_name}%253A{url_encoded_tag}
  &sort=vulnerabilityRiskScore
```

- Replace `{image_name}` with the user-supplied image name.
- Replace `{url_encoded_tag}` with the URL-double-encoded image tag.
- Pass the Twistlock token as a Bearer token in the `Authorization` header.

**Expected Response:** See `registry-respons.json` for a sample.

**Data Extraction:** Locate the result whose `repoTag.repo` and `repoTag.tag` match the user inputs, then extract the `repoTag.registry` value.

```json
"repoTag": {
    "registry": "986019062625.dkr.ecr.us-east-1.amazonaws.com",
    "repo": "ccdi-federation-dcc",
    "tag": "1.2.0.10"
}
```

If no matching record is found, the tool must display an error and stop processing.

---

### Step 2 — Retrieve Vulnerability Scan Results

Using the registry hostname resolved in Step 1, retrieve the full scan result for the specified image.

**API Call:**

```
GET https://twistlock.nci.nih.gov/api/v34.03/registry
  ?registry={registry}
  &repository={image_name}
  &tag={tag}
```

- Replace `{registry}`, `{image_name}`, and `{tag}` with the values from Step 1 and user inputs.
- Pass the Twistlock token as a Bearer token in the `Authorization` header.

**Expected Response:** See `scan-result.json` for a sample.

**Data Extraction:** Iterate over the `vulnerabilities` array and extract the following fields for each entry:

| Report Column | JSON Field | Description | Example Value |
|---|---|---|---|
| CVE Identifier | `vulnerabilities[n].cve` | CVE or advisory identifier | `CVE-2025-14831` |
| Severity | `vulnerabilities[n].severity` | Risk level (`critical`, `high`, `medium`, `low`) | `high` |
| CVSS Score | `vulnerabilities[n].cvss` | Numeric CVSS score | `7.8` |
| Package Name | `vulnerabilities[n].packageName` | Affected software package | `gnutls28` |
| Package Version | `vulnerabilities[n].packageVersion` | Installed version of the package | `3.8.9-3+deb13u1` |
| Fix Status | `vulnerabilities[n].status` | Remediation availability | `fixed in 3.8.9-3+deb13u2` |
| Date Identified | `vulnerabilities[n].discovered` | ISO 8601 timestamp; format as `YYYY-MM-DD` in the report | `2026-02-09` |
| Description | `vulnerabilities[n].description` | Summary of the vulnerability | *(free text)* |
| Reference Link | `vulnerabilities[n].link` | URL to the CVE advisory | *(URL)* |

If the `vulnerabilities` array is empty or absent, the report section should state "No vulnerabilities found."

---

## 4. Report Output

The generated report must populate the following three sections of the report template.

### 4.1 Project Details

| Report Field | Source |
|---|---|
| Project Name | User input |
| TPM | User input |
| Report Date | Current date (auto-populated, format: `MMMM DD, YYYY`) |

### 4.2 Microservice Release Details

| Report Field | Source |
|---|---|
| Microservice Name | User input |
| Image Repository | User input (Image Name) |
| Image Tag / Version | User input |
| Registry | Resolved from Step 1 (`repoTag.registry`) |
| Scan Date | API response (`scanTime`), formatted as `MMMM DD, YYYY` |
| OS / Distribution | API response (`distro`) |
| Total Vulnerabilities | API response (`vulnerabilitiesCount`) |

### 4.3 Security Scan Findings by Microservice

Populate one row per entry in the `vulnerabilities` array, sorted by severity (critical → high → medium → low).

| Microservice Name | CVE Identifier | Severity | Date Identified | Jira Ticket |
|---|---|---|---|---|
| *(from `imageName`)* | *(from API `.cve`)* | *(from API `.severity`)* | *(from API `.discovered`)* | *(left blank)* |

---

## 6. Error Handling

| Condition | Expected Behavior |
|---|---|
| Invalid or expired Twistlock token | Display authentication error and exit |
| Image not found in registry search (Step 1) | Display "Image not found" error and exit |
| Scan result not available for image (Step 2) | Display "No scan data available" message and exit |
| `vulnerabilities` array is empty | Populate the findings table with "No vulnerabilities found" |
| API returns non-200 HTTP status | Display the HTTP status code and response message, then exit |

---

## 7. Acceptance Criteria

- [ ] Given valid inputs, the tool successfully calls both APIs and generates a populated report.
- [ ] The registry hostname is correctly resolved from the Step 1 response and used in Step 2.
- [ ] Vulnerability fields (CVE identifier, severity, date identified) are extracted and mapped to the correct report columns. Microservice Name is populated from the user-supplied image name. Jira Ticket column is left blank for manual entry.
- [ ] Vulnerabilities in the report are sorted by severity (critical first, low last).
- [ ] Project Details, Microservice Release Details, and Security Scan Findings sections are all populated correctly.
- [ ] The Report Date is auto-populated with the current date at runtime.
- [ ] The tool displays a clear error message and exits gracefully when the API returns an error or the image is not found.

**Web Application / UI**

- [ ] The web app renders correctly in Chrome, Firefox, and Edge (latest two major versions).
- [ ] All six input fields are present on the form; Project Name and TPM are labelled as optional.
- [ ] The Twistlock Token field masks user input.
- [ ] Submitting the form with any blank **required** field displays an inline validation error and does not call the backend.
- [ ] Clicking "Generate Report" disables the button and shows a loading spinner for the duration of the API calls.
- [ ] On success, the report file is downloaded automatically with the correct filename format.
- [ ] On error, a descriptive error banner is shown and the form remains editable for correction and resubmission.
- [ ] The Twistlock token is never sent to or logged by the browser; all Twistlock API calls are made server-side.
