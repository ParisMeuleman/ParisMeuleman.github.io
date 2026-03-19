# StarCraft TMG Data Sync

This repository contains a sync script to automatically update the local JSON data from the Firebase backend.

## Local Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment:**
    Copy `.env.template` to `.env` and fill in your Firebase configuration.
    ```bash
    cp .env.template .env
    ```

3.  **Run Sync:**
    ```bash
    npm run sync
    ```
    This will fetch any new versions of Rules and Factions and update `jsons/data_manifest.json`.

## GitHub Actions Configuration

You can automate this sync using GitHub Actions.

1.  **Add Secrets:**
    In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add the following secrets:
    - `FIREBASE_API_KEY`
    - `FIREBASE_AUTH_DOMAIN`
    - `FIREBASE_PROJECT_ID`
    - `FIREBASE_STORAGE_BUCKET`
    - `FIREBASE_MESSAGING_SENDER_ID`
    - `FIREBASE_APP_ID`
    - `FIREBASE_MEASUREMENT_ID`
    - `FIREBASE_DATABASE_ID` (optional, defaults to `starcrafttmgbeta`)

2.  **Workflow File:**
    Create a file at `.github/workflows/sync.yml`:
    ```yaml
    name: Sync Firebase Data
    on:
      schedule:
        - cron: '0 0 * * *' # Run daily at midnight
      workflow_dispatch: # Allow manual trigger

    jobs:
      sync:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with:
              node-version: '20'
          - run: npm install
          - name: Run Sync Script
            env:
              FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
              FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
              FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
              FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
              FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
              FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
              FIREBASE_MEASUREMENT_ID: ${{ secrets.FIREBASE_MEASUREMENT_ID }}
              FIREBASE_DATABASE_ID: ${{ secrets.FIREBASE_DATABASE_ID }}
            run: npm run sync
          - name: Commit and Push Changes
            run: |
              git config --global user.name 'github-actions[bot]'
              git config --global user.email 'github-actions[bot]@users.noreply.github.com'
              git add jsons/
              git diff --quiet && git diff --staged --quiet || (git commit -m "Auto-sync: Update data to latest version" && git push)
    ```
