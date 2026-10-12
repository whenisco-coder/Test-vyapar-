# Deployment (GitHub, Cloudflare Pages, D1)

Zero budget (D19). The owner does these steps once; agents never get tokens (D28). Cloudflare screens change, so follow the current Cloudflare documentation for exact clicks and check free-tier limits there before relying on the numbers below.

## 1. GitHub
1. Create a private repository (empty). Turn on two-factor authentication for the account.
2. Add the project files (AGENTS.md, docs/, START-PROMPT.md, README.md).
3. Protect the main branch: require pull requests, block force pushes.
4. Turn on Dependabot alerts.

## 2. Cloudflare Pages (the app)
1. Create a free Cloudflare account with two-factor authentication.
2. Create a Pages project from the GitHub repo.
3. Build command `npm run build`, output directory `dist` (the agent confirms in README.md).
4. Each push to main deploys. Pull requests get preview URLs (use them for phone testing).
5. Add the `_headers` file for security headers (see docs/security.md); verify after deploy.

## 3. Relay (Pages Functions plus D1)
1. Create a D1 database in the Cloudflare dashboard.
2. Apply `functions/schema.sql` (the agent provides it) using the dashboard console or Wrangler.
3. Bind the database to the Pages project (Settings, Functions, D1 bindings) using the variable name given in README.md, for Production and Preview.
4. Redeploy. Open `/api/health` to confirm.

## 4. Install on phones
1. Open the app URL in Brave or Firefox on Android over HTTPS.
2. Install it (Add to Home screen / Install app).
3. Open once online so the app shell is cached; then test airplane mode.
4. Create the workspace on the owner's device; pair staff phones by invite QR.

## 5. Free-tier budget check (verify current limits)
- Sync every 30 seconds while open, 10 devices, 10 hours a day, is about 12,000 relay requests a day, well below typical free daily request limits.
- The relay stores batches, not single changes, to stay inside D1 write limits. Photos are the first thing to hit storage limits; the app has a quota guard.
- Watch the Cloudflare dashboard usage monthly. If a limit is near, reduce photo sync or sync frequency before paying.

## 6. Releasing a new version
1. Agent opens a pull request; owner reviews the report and the preview URL on the phone.
2. Merge to main; Pages deploys.
3. Phones show "update available"; finish syncing, then update.
4. Migrations run at startup with a safety snapshot; the app refuses downgrades.
5. Keep the previous deployment available in Cloudflare for rollback.

## 7. Rollback
- Re-deploy the previous commit from Cloudflare. Because migrations refuse downgrades, if a bad migration ran, restore from the pre-migration snapshot or the last encrypted backup instead of editing data.
