

# AI Follow-up System Fix Plan

## Problems Identified

1. **Follow-up resets on customer reply** (Line 693-700 in `facebook-webhook/index.ts`): When a customer replies, the code resets `ai_followup_step` back to 0 and reschedules from step 1. This means if follow-up #2 was already sent and the customer replies, the system starts over from follow-up #1 again.

2. **Follow-up does not persist after AI failure**: When AI generation or Facebook send fails, the `ai_followup_step` and `ai_followup_next_at` are NOT preserved -- the followup tag ("FOLLOW-UP") is never added, so there's no visual indicator.

3. **Hint field is a single-line `<Input>`** (Line 1023 in `PageAutomationDialog.tsx`): Should be a `<Textarea>` so users can write long, detailed hints.

4. **Lead conversion does not add "FOLLOW-UP" tag before pausing**: When followup is active, conversations should have a "FOLLOW-UP" tag for visibility.

## Solution

### 1. Stop resetting follow-up on customer reply

**File: `supabase/functions/facebook-webhook/index.ts`** (Lines 693-701)

Change the logic so that when a customer replies:
- Do NOT reset `ai_followup_step` back to 0
- Instead, keep the current step and just reschedule the next follow-up timer from NOW + the current step's delay
- This ensures the follow-up sequence continues forward, not restart

### 2. Add "FOLLOW-UP" tag when AI follow-up is active

**File: `supabase/functions/facebook-webhook/index.ts`**

When AI follow-up is first initialized (after AI reply, lines 1016-1025), add "FOLLOW-UP" tag to conversation tags if not already present.

### 3. Preserve follow-up scheduling on AI failure

**File: `supabase/functions/daily-followup/index.ts`** (Lines 259-267)

When AI follow-up fails:
- Still mark `status: "ai_failed"` with reason
- But keep `ai_followup_step` and `ai_followup_next_at` so it can retry next cycle
- Add "FOLLOW-UP" tag to the conversation

### 4. Extend hint field to Textarea

**File: `src/components/pages/PageAutomationDialog.tsx`** (Line 1023)

Change `<Input>` to `<Textarea>` with auto-resize capability so users can write detailed hints of any length.

### 5. Pause follow-up only on lead conversion

No change needed here -- the existing code at lines 1007-1011 already nullifies follow-up on lead creation. Just need to make sure it also removes the "FOLLOW-UP" tag and this is already handled.

---

## Technical Details

### facebook-webhook/index.ts Changes

```text
Lines 693-701: Replace "reset follow-up timer" logic
  BEFORE: Always resets to step 0
  AFTER:  Keep current step, reschedule from now + current step's delay
          Only reset if ai_followup_step is null (not yet started)

Lines 1016-1025: After AI reply, when starting followup tracking
  ADD: Include "FOLLOW-UP" tag in conversation tags
```

### daily-followup/index.ts Changes

```text
Lines 259-267: On AI failure
  BEFORE: Sets status to ai_failed, stops there (no next schedule)
  AFTER:  Sets status to ai_failed with reason,
          BUT keeps ai_followup_step and reschedules ai_followup_next_at
          for retry in 1 hour, so it tries again next cycle.
          Adds "FOLLOW-UP" tag.
```

### PageAutomationDialog.tsx Changes

```text
Line 1023: Change <Input> to <Textarea>
  Add: rows={3}, auto-expanding with min-height
  This allows long detailed hints like the ones shown in the screenshot
```

