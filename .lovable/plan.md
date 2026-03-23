

## Plan: AI Prompt Caching System to Reduce Cloud Balance Usage

### Problem
Every incoming message triggers the `ai-reply` edge function which:
1. Fetches `reply_templates` from DB (1 query)
2. Fetches `app_settings` (ai_tone) from DB (1 query)  
3. Rebuilds the entire system prompt (~2000+ tokens) from scratch
4. Sends this large prompt + message to the AI gateway

The AI gateway charges per token — the system prompt tokens are sent **every single message**. This is the main cost driver.

### Solution: Pre-compiled Prompt Cache

When the user clicks **Save** on a page's AI settings, we pre-compile and store the full system prompt in a new DB table. On each message, `ai-reply` reads the cached prompt (1 query) instead of building it from 3+ queries.

**Key benefit**: We can also **optimize/shorten** the cached prompt at save-time, removing verbose explanations the AI doesn't need repeated. This directly reduces token cost per message.

### Changes

**1. New DB table: `page_ai_prompt_cache`**
- `page_id` (uuid, unique, FK to connected_pages)
- `compiled_prompt` (text) — the ready-to-use system prompt
- `script_config` (jsonb) — language/script detection rules
- `media_assets` (jsonb) — cached media asset list
- `updated_at` (timestamp)

**2. New edge function: `compile-ai-prompt`**
- Called when Save button is clicked on page AI settings
- Takes page_id, fetches all page settings + templates + app_settings
- Builds and **compresses** the system prompt (removes verbose repeat instructions, keeps only essential rules)
- Stores in `page_ai_prompt_cache`
- Estimated prompt reduction: ~30-40% fewer tokens

**3. Update `ai-reply` edge function**
- First check `page_ai_prompt_cache` for this page
- If cache exists → use cached prompt directly (skip templates + settings queries)
- If no cache → fall back to current behavior (build from scratch)
- Script-lock and per-message dynamic parts (customer message, conversation history, hasExistingLead, longGapConfirmation) still added dynamically each time

**4. Update frontend Save handler**
- After saving page AI settings, call `compile-ai-prompt` to regenerate the cache
- Show toast on success

**5. Backfill: compile cache for all existing pages**
- One-time migration/script to compile prompts for all currently configured pages

### What stays the same
- AI still replies exactly as before — same logic, same rules
- Script matching (Roman Nepali, Devanagari, English) still works per-message
- Lead detection, complaint detection, media sending — all unchanged
- The system just reads a pre-built prompt instead of building one each time

### Cost Savings Estimate
- ~2 fewer DB queries per message
- ~30-40% fewer input tokens per AI call (compressed prompt)
- At high volume, this meaningfully reduces cloud balance consumption

### Technical Details

```text
Current flow (per message):
  webhook → ai-reply → [query templates] → [query settings] → [build prompt ~2000 tokens] → AI gateway

New flow (per message):  
  webhook → ai-reply → [query cached prompt ~1200 tokens] → AI gateway

Save button flow:
  frontend → save settings → compile-ai-prompt → store in page_ai_prompt_cache
```

