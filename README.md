# Twistlock Report App

Next.js application that generates Twistlock security reports.

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
