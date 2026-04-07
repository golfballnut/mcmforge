# TOOLS.md — DirtSync Presentation Builder

## Available Tools
- gws CLI v0.18.0 (Google Workspace: Drive, Slides, Calendar)
- File read/write (design specs, artifact staging)
- Bash (file path resolution, gws commands)

## IMPORTANT: gws Auth
gws CLI is authenticated on Mini. Env vars set in orchestrator .env:
- GOOGLE_WORKSPACE_CLI_CLIENT_ID
- GOOGLE_WORKSPACE_CLI_CLIENT_SECRET
- GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file
Credentials at ~/.config/gws/credentials.json

## Visual Tools for Slides
- **Mockuuups MCP** — put screenshots in device frames for professional slides
- **Excalidraw MCP** — create flow diagrams and wireframes to embed in slides

## Account
`dirtsyncapp@gmail.com`

## Google Drive Commands

```bash
# Create folder
gws drive create-folder \
  --name "DirtSync Design Reviews" \
  --parent-id root

gws drive create-folder \
  --name "DIRA-<N> <Feature Name>" \
  --parent-id <reviews-folder-id>

# Upload file to folder
gws drive upload \
  --file /path/to/screenshot.png \
  --parent-id <folder-id>

# Share with Steve
gws drive share \
  --file-id <ID> \
  --email steve@linkschoice.com \
  --role writer

# List files in folder
gws drive list --parent-id <folder-id>
```

## Google Slides Commands

```bash
# Create presentation
gws slides create \
  --title "DirtSync — DIRA-<N>: <Feature> Design Review"

# Add a slide
gws slides add-slide \
  --presentation-id <ID> \
  --layout TITLE_AND_BODY

# Update slide text
gws slides update-text \
  --presentation-id <ID> \
  --page <N> \
  --text "Your text here"

# Share presentation
gws drive share \
  --file-id <presentation-id> \
  --email steve@linkschoice.com \
  --role writer
```

## Google Calendar Commands

```bash
# Create review event
gws cal create-event \
  --title "REVIEW: DIRA-<N> <Feature> Design" \
  --description "Design review ready.\n\nSlides: <URL>\nDrive folder: <URL>\n\nReply APPROVED or REVISE: <feedback>" \
  --start "tomorrow 9:00 AM" \
  --duration 30 \
  --attendees steve@linkschoice.com
```

## Drive Folder Structure
```
DirtSync Design Reviews/          (root reviews folder)
├── DIRA-1 <Feature>/
│   ├── current-state.png
│   ├── reference-waze.png
│   ├── gold-star-spec.md
│   └── DIRA-1-Design-Review.gslides
├── DIRA-2 <Feature>/
└── DIRA-N <Feature>/
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned presentation tasks
GET  /api/agent/issues/:id/context — design spec + App Designer comments
PATCH /api/agent/issues/:id        — post links, update status to in_review
```

## What You CANNOT Do
- Create a presentation without a CEO-approved design spec
- Skip the calendar event — it's how Steve knows to review
- Push files to Drive root — always use sprint/issue folder
- Share without explicitly adding steve@linkschoice.com
- Write more than 15 words per bullet (Steve is on his phone)
