# Setting up automatic preview requests (Alon, once, about 10 minutes)

Cloud chats can't create GitHub workflow files, and keys never go in chat, so these steps are yours.

1. **Add the workflow.** On github.com open kelon33/neon-sign-sites → **Add file** → **Create new file**.
   Name it `.github/workflows/preview-request.yml`, paste the whole of `docs/setup/preview-request.yml`
   (open it on GitHub → **Raw** → copy all), then **Commit changes** to main.
2. **Repository secrets.** In the repo: **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**, five times, each with the same value as in your Claude environment settings:
   `NEON_ANTHROPIC_API_KEY`, `NEON_GOOGLE_PLACES_API_KEY`, `NEON_GMAIL_CLIENT_ID`,
   `NEON_GMAIL_CLIENT_SECRET`, `NEON_GMAIL_TOKEN_ALON_NET`.
3. **A token so the website can start it.** github.com → your picture → **Settings** → **Developer settings**
   → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Repository access:
   **Only select repositories** → kelon33/neon-sign-sites. Permissions → Repository → **Contents: Read and write**.
   Expiration: the longest offered. Generate and copy it.
4. **Give it to the Worker.** Cloudflare dashboard → **Workers & Pages** → the neon-sign-sites Worker →
   **Settings** → **Variables and Secrets** → **Add** → type **Secret**, name `GITHUB_DISPATCH_TOKEN`,
   paste the token → **Deploy**.
5. Tell the builder chat "done": it sends one test request (to your own email) and checks the whole run.
