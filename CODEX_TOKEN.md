# How to Get Your Codex API Token

The Codex token is needed to display ChatGPT usage quotas in the dashboard.

## Method 1: Browser DevTools (Recommended)

1. **Open ChatGPT** in your browser: https://chatgpt.com
2. **Login** to your account
3. **Open DevTools**:
   - Chrome/Edge: `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Firefox: `F12` or `Cmd+Option+K` (Mac) / `Ctrl+Shift+K` (Windows/Linux)
4. **Go to Network tab**
5. **Reload the page** (`F5` or `Cmd+R`)
6. **Filter by "usage"** in the Network tab search box
7. **Find the request** to `backend-api/wham/usage`
8. **Click on it** and go to **Headers** tab
9. **Look for "Authorization"** in Request Headers
10. **Copy the token** - it looks like:
    ```
    Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1UaEVOVUpHTkVNMVFURTRNMEZCTWpk...
    ```

## Method 2: Cookies (Alternative)

If the Authorization header is not visible:

1. Open DevTools → **Application** tab (Chrome) or **Storage** tab (Firefox)
2. Go to **Cookies** → `https://chatgpt.com`
3. Find cookie named: `__Secure-next-auth.session-token`
4. Copy its **Value**

## Save the Token

Once you have the token:

```bash
# Save to config (no need to pass it every time)
bun run dev --config set-codex-token --token <your-token>

# Verify it's saved
bun run dev --config show

# Now dashboard will use it automatically
bun run dev --dashboard
```

## Token Format

- **JWT tokens** (Authorization header): Start with `eyJ...`
- **Session tokens** (cookie): Various formats, often start with `sess-` or similar

## Security Notes

- ⚠️ **Never share your token** - it gives full access to your ChatGPT account
- ⚠️ Token is stored in plaintext at `~/.config/opencode-usage/config.json`
- 🔄 Tokens expire - you may need to refresh it periodically
- 🗑️ To remove: `rm ~/.config/opencode-usage/config.json`

## Troubleshooting

**Token not working?**

- Make sure you copied the **full token** (can be very long)
- Remove `Bearer ` prefix if present (only the token itself)
- Token may have expired - get a fresh one
- Try logging out and back into ChatGPT

**Can't find the usage endpoint?**

- Make sure you're on chatgpt.com (not chat.openai.com)
- Try navigating to https://chatgpt.com/codex/settings/usage
- Reload the page and check Network tab again

**Dashboard shows "error" for Codex?**

- Check token with `--config show`
- Verify token format is correct
- Get a fresh token from browser
