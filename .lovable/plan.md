
# Plan: Facebook Integration Fixes + Automation Persistence

## Summary
तीनवटा मुख्य समस्याहरूको समाधान:
1. Token expiry - Long-lived token exchange + auto-refresh
2. Facebook App ID - Database-based runtime configuration
3. Automation settings - Proper save र persist

---

## ISSUE 1: Token Auto-Expire Fix

### Current Problem
- Facebook बाट आउने page access token short-lived (~60 days without long-lived exchange)
- `token_expiry` column छ तर कहिल्यै set हुँदैन (always NULL)
- Token exchange/refresh mechanism छैन
- Token expire भएपछि reconnect मात्र विकल्प

### Solution Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Facebook OAuth Flow                       │
├─────────────────────────────────────────────────────────────┤
│  1. User Login → Short-lived User Token (~2 hours)          │
│  2. Exchange → Long-lived User Token (~60 days)             │
│  3. Get Pages → Page Access Tokens (inherit from user)      │
│  4. Store token + expiry date in DB                         │
│  5. Scheduled check → Refresh before expiry                 │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

**A. Update `facebook-connect` Edge Function**
- Add `exchangeLongLivedToken` action
- Exchange short-lived user token for long-lived user token via Graph API:
  ```
  GET /oauth/access_token?grant_type=fb_exchange_token
    &client_id={app-id}
    &client_secret={app-secret}
    &fb_exchange_token={short-lived-token}
  ```
- Calculate and store `token_expiry` (now + 60 days)
- On reconnect, always do fresh token exchange

**B. Add Token Health Check (Edge Function)**
- Create `facebook-token-health` edge function
- Check all connected pages' `token_expiry`
- If expiring within 7 days, attempt refresh
- Mark as `token_expired` if refresh fails

**C. Frontend Updates**
- Show token expiry date in page card
- When `token_expiry < now + 7 days`, show warning
- When `token_expired`, disable automation + show reconnect CTA

---

## ISSUE 2: Facebook App ID Runtime Configuration

### Current Problem
- `VITE_FACEBOOK_APP_ID` is build-time env variable
- Production मा missing भए Facebook Login काम गर्दैन
- Admin ले UI बाट configure गर्न मिल्दैन

### Solution Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                 Runtime Configuration Flow                │
├──────────────────────────────────────────────────────────┤
│  1. Admin → Settings → Facebook Integration Settings     │
│  2. Enter App ID + App Secret → Save to DB               │
│  3. FB SDK Init → Check DB first → Fallback to env      │
│  4. If neither, show "Configure in Settings" message     │
└──────────────────────────────────────────────────────────┘
```

### Implementation Steps

**A. Database: Use existing `app_settings` table**
- Add settings with keys:
  - `facebook_app_id`
  - `facebook_app_secret` (for token exchange)
  - `facebook_webhook_verify_token`

**B. Create Admin Settings UI**
- Add "Facebook Integration" section in Settings page
- Fields: App ID, App Secret (masked), Webhook Verify Token
- Save/Test Connection buttons
- Only visible to admin role users

**C. Update Facebook SDK Loader**
- Modify `loadFacebookSDK()` in `useFacebookPages.ts`:
  1. First try: Fetch `facebook_app_id` from `app_settings` table
  2. Fallback: Use `VITE_FACEBOOK_APP_ID` env variable
  3. If neither: Return helpful error with Settings link

**D. Update Edge Functions**
- `facebook-connect`: Read `facebook_app_secret` from `app_settings` for token exchange

---

## ISSUE 3: Automation Settings Not Persisting

### Current Problem
Database check shows:
```
auto_reply_keywords: []  (empty even after save)
auto_reply_first_message: default text
automation_enabled: true
```

### Root Cause Analysis
- `useUpdatePageSettings` mutation works correctly
- Query invalidation happens on success
- Issue: Keywords save correctly but next dialog open may reset state

### Solution

**A. Fix State Initialization in PageAutomationDialog**
- Ensure `useEffect` only runs when `open` changes to `true`
- Add loading state to prevent early user interaction
- Add "dirty state" tracking to warn unsaved changes

**B. Improve Save Flow**
- Add `isSaving` state to disable form during save
- Show explicit "Saved!" confirmation
- Keep dialog open briefly after save for feedback
- Verify data persisted by refetching

**C. Add Visual Feedback**
- Show saved keywords count in page card
- Display "Last updated" timestamp
- Indicate when settings differ from default

---

## Technical Implementation Details

### File Changes Required

| File | Changes |
|------|---------|
| `supabase/functions/facebook-connect/index.ts` | Add long-lived token exchange logic |
| `supabase/functions/facebook-token-health/index.ts` | NEW - Token health checker |
| `src/hooks/useFacebookPages.ts` | Runtime App ID fetch from DB |
| `src/hooks/useAppSettings.ts` | NEW - Fetch/update app settings |
| `src/pages/Settings.tsx` | Add Facebook Integration settings section |
| `src/components/pages/PageAutomationDialog.tsx` | Fix state persistence, add loading states |
| `src/pages/Pages.tsx` | Show token expiry warning, keywords count |

### Database Changes

```sql
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_app_settings_key 
  ON app_settings(setting_key);

-- Seed default Facebook settings (if not exists)
INSERT INTO app_settings (setting_key, setting_value)
VALUES 
  ('facebook_app_id', '""'),
  ('facebook_app_secret', '""'),
  ('facebook_webhook_verify_token', '"socialbox_verify_token"')
ON CONFLICT (setting_key) DO NOTHING;
```

### New Edge Function: facebook-token-health

```typescript
// Pseudo-code structure
async function checkTokenHealth() {
  // 1. Get all connected pages
  // 2. For each page with token_expiry < now + 7 days:
  //    - Try to refresh using app_secret
  //    - Update token_expiry on success
  //    - Mark token_expired on failure
  // 3. Return health report
}
```

---

## Acceptance Criteria

| Feature | Test |
|---------|------|
| Token Exchange | New connection stores `token_expiry` (60 days from now) |
| Token Refresh | Pages expiring within 7 days auto-refresh |
| Token Expired UI | Expired pages show reconnect CTA, automation disabled |
| FB Settings | Admin can save App ID in Settings |
| FB Login | Works with DB-stored App ID (env fallback) |
| Automation Save | Keywords persist after dialog close |
| Automation Load | Saved settings display correctly on reopen |
| Automation Toggle | ON/OFF works and persists |

---

## Estimated Implementation Order

1. **Phase 1**: Fix automation settings persistence (quickest win)
2. **Phase 2**: Add Facebook Integration Settings UI
3. **Phase 3**: Implement long-lived token exchange
4. **Phase 4**: Add token health check mechanism

