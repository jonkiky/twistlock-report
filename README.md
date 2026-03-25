# Twistlock Report App

Next.js application for searching Twistlock or Prisma Cloud repositories by project name and generating a combined container scan report as a Word document.

## What the app does

The application supports this workflow:

1. Sign in with a Twistlock username and password.
2. Search repositories by project name.
3. Select one or more repositories and image tags.
4. Generate and download a combined `.docx` scan report.

The generated report includes project details, release details, and vulnerability findings pulled from the Twistlock API.
