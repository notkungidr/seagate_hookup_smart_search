# ⚠️ SECURITY NOTICE

**IMPORTANT:** This repository uses environment variables for database credentials.

## Setup Instructions

1. **Copy the example file:**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Edit `.env` and fill in your actual credentials** (NEVER commit this file!)

3. **Verify `.env` is ignored:**
   ```bash
   git status
   # .env should NOT appear in the list
   ```

## What's Protected

- Database usernames and passwords
- Database hosts and connection strings
- SSL/TLS certificates paths
- Any sensitive configuration

## Files to NEVER Commit

- `.env`
- `backend/.env`
- Any file containing real credentials

The `.gitignore` is configured to block these files automatically.
