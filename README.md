# Twistlock Report App

Next.js application that generates Twistlock security reports.



## Usage

### What This App Does

The Twistlock Report App generates security vulnerability scan reports for container images by:
1. Connecting to your Twistlock/Prisma Cloud instance
2. Retrieving vulnerability scan data for a specified container image
3. Formatting the data into a professional Word document (.docx)

### How to Use

1. **Open the app** at `http://localhost:3000` (or your deployment URL)

2. **Fill out the form** with the following information:

   | Field | Required | Description |
   |-------|----------|-------------|
   | **Project Name** | Optional | Name of the project (e.g., `CRDC CCDI`) |
   | **TPM** | Optional | Technical Program Manager name (e.g., `Jane Smith`) |
   | **Repository (imageName)** | **Yes** | Docker image name (e.g., `ccdi-federation-dcc`) |
   | **Image Tag** | **Yes** | Image version/tag (e.g., `1.2.0.10`) |
   | **Twistlock Token** | **Yes** | Bearer token from Twistlock/Prisma Cloud |

3. **Get your Twistlock Token**:
   - Log in to your Twistlock/Prisma Cloud console
   - Navigate to Settings → API Keys
   - Create a new API token or copy an existing one
   - Paste it into the **Twistlock Token** field

4. **Generate the report**:
   - Click the **"Generate Report"** button
   - Wait for the report to be generated (you'll see "Generating..." on the button)
   - The Word document will automatically download to your computer

5. **Check the downloaded file**:
   - The report file is named in the format: `ProjectName_ImageName_Tag_ScanReport_YYYYMMDD.docx`
   - Open it with Microsoft Word or any compatible application

### Notes

- The **Twistlock Token** is sent securely to the backend and never exposed in your browser
- Only **Repository (imageName)** and **Image Tag** are strictly required to have the microservice name in your report be the same as the image name
- If you encounter errors, check that:
  - Your Twistlock token is valid and has permission to access the image
  - The image name and tag exist in your Twistlock registry
  - You have network connectivity to your Twistlock instance
  

## Prerequisites

- Docker Desktop (or Docker Engine)
- GNU Make (usually preinstalled on macOS)

## Run With Docker (Simple)

From the project root, run:

1. Build the image from `Dockerfile`:

```bash
docker build -t twistlock-report-app:latest .
```

2. Run the image as a container:

```bash
docker run --name twistlock-report-app --rm -d -p 3000:3000 twistlock-report-app:latest
```

3. Open the app:

```text
http://localhost:3000
```

4. Check logs (optional):

```bash
docker logs -f twistlock-report-app
```

5. Stop the container:

```bash
docker stop twistlock-report-app
```

## Container Environment Variables

The image runs with:

- `NODE_ENV=production`
- `PORT=3000`
- `HOSTNAME=0.0.0.0`

If you need custom environment variables from your local `.env` file, run Docker directly:

```bash
docker run --name twistlock-report-app --rm -d -p 3000:3000 --env-file .env twistlock-report-app:latest
```





## Local Development (Without Docker)

Install dependencies and run dev server:

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.
