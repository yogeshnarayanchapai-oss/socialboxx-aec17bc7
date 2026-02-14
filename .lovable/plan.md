

# SaaS Multi-Tenant Conversion Plan

## Overview
System lai single-tenant bata multi-tenant SaaS model ma convert garnu parcha. Customer signup garda pending status ma bascha, platform admin le approve garepaxi matra system use garna milcha. Each customer le aafno organization banaucha, team add garcha, ra aafna pages ko matra data hercha.

## Current Problems
- Ahile sabai user le sabai data dekhincha (no data isolation)
- Signup garda sidhai admin role dincha sabailai
- Organization/company concept chhaina
- Team management org-level ma chhaina

---

## Phase 1: Database Schema Changes

### 1.1 New `organizations` Table
- `id` (uuid, primary key)
- `name` (text) - Company/Organization name
- `owner_id` (uuid, references auth.users)
- `status` (text: 'pending', 'approved', 'rejected') - default 'pending'
- `approved_by` (uuid, nullable)
- `approved_at` (timestamp, nullable)
- `created_at`, `updated_at`

### 1.2 New `organization_members` Table
- `id` (uuid, primary key)
- `organization_id` (uuid, FK to organizations)
- `user_id` (uuid, FK to auth.users)
- `role` (app_role: admin/manager/agent)
- `invited_by` (uuid, nullable)
- `created_at`
- Unique constraint on (organization_id, user_id)

### 1.3 Add `organization_id` Column to Existing Tables
These tables get a new `organization_id` column (uuid, nullable initially, then required):
- `connected_pages`
- `conversations`
- `leads`
- `messages` (through conversation relation)
- `followup_logs`
- `automation_rules`
- `app_settings`
- `reply_templates`

### 1.4 New Database Functions
```text
get_user_org_id(user_id) -> returns organization_id
  - Security definer function
  - Used in all RLS policies

is_platform_admin(user_id) -> boolean
  - Checks if user is the platform super admin
  - Used for approve/reject functionality
```

### 1.5 Update `handle_new_user` Trigger
- Create organization with status 'pending'
- Add user to organization_members as 'admin' (org admin)
- Create profile
- Do NOT add to old user_roles table (migrate to org_members)

### 1.6 RLS Policy Updates (All Tables)
Every table's RLS policy changes to:
- SELECT: user can only see rows where `organization_id = get_user_org_id(auth.uid())`
- INSERT/UPDATE/DELETE: same org check + role check
- Platform admin can see organizations table for approval

---

## Phase 2: Auth Flow Changes

### 2.1 Signup Flow Update (`Auth.tsx`)
- Add "Company Name" field to signup form
- After signup, show message: "Account created! Admin le approve garepaxi login garna milcha"

### 2.2 Pending Approval Screen
- New component: `PendingApproval.tsx`
- Shows when user logs in but org status is 'pending'
- Message: "Tapainko account review ma cha. Approve vayepaxi email aaucha"
- Sign out button

### 2.3 Rejected Screen
- Shows if org status is 'rejected'
- Message with contact info

### 2.4 ProtectedRoute Update
- After auth check, also check org status
- pending -> show PendingApproval
- rejected -> show Rejected
- approved -> allow access

---

## Phase 3: Platform Admin Panel

### 3.1 New Admin Route `/admin`
- Only visible to platform super admin
- Shows list of all organizations with status
- Approve / Reject buttons
- View organization details (owner email, signup date)

### 3.2 Admin Sidebar Item
- Show "Admin" nav item only for platform admin
- Shield icon

---

## Phase 4: Team Management

### 4.1 Update Settings > Team Tab
- Show current org members
- Invite new member (by email)
- Set role (admin/manager/agent)
- Remove member
- Only org admin can manage team

### 4.2 Team Invite Flow
- Org admin enters email + role
- System creates auth user invitation or just adds to org_members
- New user signs up -> gets added to existing org instead of creating new one
- Alternative: simple approach - admin creates account, shares credentials initially

---

## Phase 5: Data Isolation (Query Updates)

### 5.1 Hook Updates
All data hooks need org-scoped queries (RLS handles this automatically once org_id is set):
- `useConnectedPages` - already filtered by RLS
- `useConversations` - filtered by RLS
- `useLeads` - filtered by RLS
- `useDashboard` - filtered by RLS

### 5.2 Edge Functions Update
- `facebook-connect`: Set organization_id when connecting page
- `facebook-webhook`: Look up org from page_id
- `ai-reply`: No change needed (uses conversation context)
- `facebook-messages`: No change needed (uses page context)

---

## Phase 6: Future Subscription Ready

### 6.1 Organization Table Fields (pre-built)
- `plan` (text: 'free', 'starter', 'pro') - default 'free'
- `max_pages` (integer) - default 3
- `max_team_members` (integer) - default 5
- These limits checked in frontend but enforced in RLS/edge functions later
- Stripe integration added later when needed

---

## Implementation Order

```text
Step 1: Database migrations (organizations, org_members, add org_id columns)
Step 2: Database functions (get_user_org_id, is_platform_admin)
Step 3: Update handle_new_user trigger
Step 4: Update all RLS policies
Step 5: Update Auth.tsx (company name field, pending flow)
Step 6: Create PendingApproval component
Step 7: Update ProtectedRoute
Step 8: Create Admin panel (approve/reject)
Step 9: Update Team management in Settings
Step 10: Update edge functions (set org_id)
Step 11: Add admin nav item
Step 12: Migrate existing data (set org_id for current records)
```

---

## Technical Notes

- Platform super admin identification: store as a config or check specific user_id
- `get_user_org_id` function is critical - all RLS depends on it
- Existing data migration: current user's records get assigned to their new org
- `organization_members` replaces `user_roles` for per-org role management
- `user_roles` table kept for backward compatibility but platform-level admin check
- Email notification on approval can be added later via edge function

