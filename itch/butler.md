# itch.io Butler CLI Integration Guide

[Butler](https://itch.io/docs/butler/) is the official command-line deployment tool built by itch.io. It is the gold-standard method for publishing and maintaining HTML5 and downloadable games.

---

## Why Use Butler Instead of Manual Zip Uploads?

1. **Binary Delta Patching (Wharf)**:
   *Iluminado* includes 50 soundtrack MP3 files (~115 MB). When you publish an update using Butler, Butler only sends the modified code bytes (typically <500 KB), rather than re-uploading the full 115 MB audio library every time.
2. **Instant Deploys**: Deployments take seconds over CLI or CI/CD pipelines.
3. **Automated Version Tracking**: Automatically bumps and tags user-facing build numbers.
4. **Zero Downtime**: The game continues running uninterrupted while new builds are processed in the background.

---

## 1. Local Installation

### macOS (Homebrew):
```bash
brew install itch/itch/butler
```

### Direct Download (macOS / Linux / Windows):
Follow the official binaries guide: [itch.io/docs/butler/installing](https://itch.io/docs/butler/installing).

Verify installation:
```bash
butler -V
```

---

## 2. Authentication

Run the interactive login command once:
```bash
butler login
```
This opens your browser to grant an API token to Butler. Tokens are securely stored in your local configuration directory (`~/.config/itch/`).

---

## 3. Pushing a Build Manually

The push syntax is:
```bash
butler push <directory_or_zip> <username>/<game-slug>:<channel> [--userversion <version>]
```

For *Iluminado* HTML5:
```bash
# 1. Build the production files
npm run build

# 2. Push directly to the html5 channel
butler push dist/ your-itch-username/iluminado:html5 --userversion 1.0.0
```

> **Note on Channels**: The `:html5` channel name tells itch.io this build is an in-browser playable game. It will automatically assign the HTML5 player to it.

---

## 4. Helper Script (`itch/deploy-butler.sh`)

We provide a turnkey deploy script in this folder:
```bash
# Make executable (first time only)
chmod +x itch/deploy-butler.sh

# Deploy with your username
./itch/deploy-butler.sh your-itch-username
```
Or set the environment variable:
```bash
export ITCH_USER="your-itch-username"
./itch/deploy-butler.sh
```

---

## 5. Automated GitHub Actions CI/CD Pipeline

To deploy automatically every time you push to the `main` branch or publish a release tag, add this workflow file to `.github/workflows/deploy-itch.yml`:

```yaml
name: Deploy to itch.io

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  deploy:
    name: Build & Push to itch.io
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build production bundle
        run: npm run build

      - name: Install Butler CLI
        run: |
          curl -L -o butler.zip https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default
          unzip butler.zip
          chmod +x butler
          sudo mv butler /usr/local/bin/
          butler -V

      - name: Push to itch.io via Butler
        env:
          BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
        run: |
          VERSION="${GITHUB_REF_NAME:-1.0.0}"
          butler push dist/ ${{ secrets.ITCH_USERNAME }}/iluminado:html5 --userversion "$VERSION"
```

### GitHub Secrets Setup:
1. Generate an itch.io API Key: Go to your itch.io **Settings** → **API Keys** → **Generate new API key**.
2. Go to your GitHub repository: **Settings** → **Secrets and variables** → **Actions**.
3. Add repository secrets:
   - `BUTLER_API_KEY`: Your generated itch API token.
   - `ITCH_USERNAME`: Your itch.io account username.

---

## 6. Verifying Build Status

Check active channels and build processing status at any time:
```bash
butler status your-itch-username/iluminado
```
You can also monitor uploads in real time with:
```bash
butler status your-itch-username/iluminado:html5
```
