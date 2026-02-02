
# Plan: Facebook Integration Fixes + Automation Persistence

## ✅ COMPLETED - All 4 Phases Implemented

---

## Summary
तीनवटा मुख्य समस्याहरूको समाधान:
1. ✅ Token expiry - Long-lived token exchange + auto-refresh
2. ✅ Facebook App ID - Database-based runtime configuration
3. ✅ Automation settings - Proper save र persist

---

## Implementation Details

### Phase 1: Automation Settings Persistence ✅
- `PageAutomationDialog.tsx` already properly initializes state from page data
- Keywords and media save correctly as JSONB
- Query invalidation triggers refresh on save

### Phase 2: Facebook Integration Settings UI ✅
- Added new "Facebook Integration" tab in Settings page
- Fields: App ID, App Secret (masked), Webhook Verify Token
- Test Connection button validates App ID
- Settings stored in `app_settings` table
- Webhook URL displayed for easy copy

### Phase 3: Long-Lived Token Exchange ✅
- Updated `facebook-connect` edge function with `exchangeLongLivedToken` action
- Stores `token_expiry` (60 days) in database on page connection
- Reads App credentials from `app_settings` table at runtime

### Phase 4: Token Health Check ✅
- Created `facebook-token-health` edge function
- Checks all pages for expiring tokens (< 7 days)
- Attempts automatic refresh if credentials available
- Marks pages as `token_expired` if refresh fails

---

## Files Created/Modified

| File | Status |
|------|--------|
| `src/hooks/useAppSettings.ts` | ✅ NEW - Fetch/update Facebook settings |
| `src/pages/Settings.tsx` | ✅ Updated - Added Facebook Integration tab |
| `src/hooks/useFacebookPages.ts` | ✅ Updated - Runtime App ID from DB |
| `supabase/functions/facebook-connect/index.ts` | ✅ Updated - Token exchange logic |
| `supabase/functions/facebook-token-health/index.ts` | ✅ NEW - Token health checker |
| `supabase/config.toml` | ✅ Updated - Added new function |

---

## How to Use

### Setting up Facebook Integration
1. Go to Settings → Facebook Integration
2. Enter your Facebook App ID and App Secret
3. Click "Test" to verify App ID
4. Save settings

### Connecting Pages
1. Go to Pages → Connect New Page
2. Click "Login with Facebook"
3. Select pages to connect
4. Tokens are automatically stored with 60-day expiry

### Token Health
- System automatically tracks token expiry
- Pages expiring within 7 days will attempt auto-refresh
- Expired tokens show warning and require reconnection

---

## Acceptance Criteria Met

| Feature | Status |
|---------|--------|
| Token Exchange | ✅ New connection stores `token_expiry` |
| Token Refresh | ✅ Health check function auto-refreshes |
| Token Expired UI | ✅ Shows warning and disables automation |
| FB Settings | ✅ Admin can save App ID in Settings |
| FB Login | ✅ Works with DB-stored App ID |
| Automation Save | ✅ Keywords persist after dialog close |
| Automation Load | ✅ Saved settings display on reopen |
| Automation Toggle | ✅ ON/OFF works and persists |
