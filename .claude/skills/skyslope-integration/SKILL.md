---
name: skyslope-integration
description: Implement the SkySlope listing folder generation feature for RealtyGrind brokerage accounts. Agents build listings, attach PDFs, and click "Generate Listing Folder" to push to SkySlope with the brokerage's checklist template. Use when asked to build, implement, or work on the SkySlope integration.
---

You are implementing a brokerage-level SkySlope integration for RealtyGrind. The full plan is at `docs/skyslope-integration-plan.md` and the SkySlope OpenAPI spec is at `/Users/derikbannister9/Downloads/swagger.json`.

## Context

- **RealtyGrind stack:** Vite + React 18, Supabase (PostgreSQL + Edge Functions in Deno), Stripe billing
- **SkySlope API:** `https://api.skyslope.com`, HMAC-SHA256 auth, 100 req/min, BETA
- **Key existing tables:** profiles, teams, team_members, listings, transactions
- **Existing patterns:** See `supabase/functions/google-auth/index.ts` for OAuth/credential handling, `supabase/functions/stripe-webhook/index.ts` for error handling, `src/pages/TeamsPage.jsx` for settings UI
- **Design system:** `src/design.jsx` for colors, buttons, card patterns

## The Workflow

1. Agent creates listing in RealtyGrind (address, price, commission, dates)
2. Agent attaches a PDF (listing agreement with all seller/property info)
3. Agent clicks **"Generate Listing Folder"**
4. RealtyGrind creates the listing folder in SkySlope using the brokerage's checklist template, uploads the PDF, and populates property/contact/commission data

---

## STEP 1: Database Migration

Create `supabase/migrations/20260321_skyslope_integration.sql`:

```sql
-- 1. Brokerage-level SkySlope credentials (clientId + clientSecret + defaults)
CREATE TABLE IF NOT EXISTS integration_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'skyslope',
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- SkySlope shape: { clientId, clientSecret, defaultOfficeGuid, defaultOfficeName,
  --                    defaultChecklistTypeId, defaultChecklistTypeName }
  session_token TEXT,
  session_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, provider)
);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owner manages integrations"
  ON integration_credentials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = integration_credentials.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role = 'owner'
    )
  );

-- Read-only policy for members to check if integration is active
CREATE POLICY "Team members read integration status"
  ON integration_credentials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = integration_credentials.team_id
        AND team_members.user_id = auth.uid()
    )
  );

-- 2. Per-agent SkySlope keys (each agent has their own accessKey/accessSecret)
CREATE TABLE IF NOT EXISTS skyslope_agent_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  access_key TEXT NOT NULL,
  access_secret TEXT NOT NULL,
  skyslope_user_guid TEXT,
  skyslope_agent_guid TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, team_id)
);

ALTER TABLE skyslope_agent_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent keys"
  ON skyslope_agent_keys FOR ALL
  USING (user_id = auth.uid());

-- Team owner can see all agent keys (to check pairing status)
CREATE POLICY "Team owner reads all agent keys"
  ON skyslope_agent_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = skyslope_agent_keys.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role = 'owner'
    )
  );

-- 3. Listing documents (PDFs attached to listings)
CREATE TABLE IF NOT EXISTS listing_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  file_name TEXT NOT NULL,
  file_type TEXT DEFAULT 'application/pdf',
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  skyslope_document_guid TEXT,  -- set after upload to SkySlope
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE listing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own listing docs"
  ON listing_documents FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Teammates read listing docs"
  ON listing_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      JOIN profiles p ON p.id = l.user_id
      WHERE l.id = listing_documents.listing_id
        AND p.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

-- 4. SkySlope columns on listings
ALTER TABLE listings ADD COLUMN IF NOT EXISTS skyslope_guid TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS skyslope_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_skyslope
  ON listings(skyslope_guid) WHERE skyslope_guid IS NOT NULL;

-- 5. Storage bucket for listing documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-docs', 'listing-docs', false)
ON CONFLICT DO NOTHING;

-- Storage policy: users upload to their own folder
CREATE POLICY "Users upload own listing docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'listing-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own listing docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'listing-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own listing docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'listing-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role needs to read any doc (for edge function to download and send to SkySlope)
-- This is handled automatically by service role bypassing RLS
```

---

## STEP 2: SkySlope Setup Edge Function

Create `supabase/functions/skyslope-setup/index.ts`.

This function handles brokerage setup operations. It accepts a JSON body with an `action` field.

### Actions

**`test-connection`**: Test brokerage + agent credentials
```
Input: { action: "test-connection", teamId, clientId, clientSecret, accessKey, accessSecret }
Steps:
  1. Generate HMAC-SHA256 (see auth section below)
  2. POST https://api.skyslope.com/auth/login
  3. If success, call GET /api/healthcheck with Session header
  4. Return { success: true } or { success: false, error: "..." }
```

**`list-offices`**: Get brokerage offices
```
Input: { action: "list-offices", teamId }
Steps:
  1. Auth using stored brokerage creds + calling user's agent keys
  2. GET /api/offices with Session header
  3. Return { offices: [{ guid, name }] }
```

**`list-checklist-types`**: Get checklist templates for an office
```
Input: { action: "list-checklist-types", teamId, officeGuid }
Steps:
  1. Auth
  2. GET /api/offices/{officeGuid}/checklistTypes with Session header
  3. Return { checklistTypes: [{ checklistTypeId, checklistTypeName }] }
```

**`verify-agent`**: Verify an agent's keys and discover their GUID
```
Input: { action: "verify-agent", teamId, accessKey, accessSecret }
Steps:
  1. Auth using brokerage clientId/Secret + agent's accessKey/Secret
  2. GET /api/users with Session header
  3. Find the user matching the auth (typically the first/only result when using agent keys)
  4. Return { userGuid, agentGuid, firstName, lastName, email }
```

### HMAC-SHA256 Auth (Deno)

```typescript
async function skyslopeAuth(
  clientId: string, clientSecret: string,
  accessKey: string, accessSecret: string
): Promise<{ session: string; expiration: string }> {
  const timestamp = new Date().toISOString();
  const encoder = new TextEncoder();

  // Generate HMAC
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(accessSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key,
    encoder.encode(`${clientId}:${clientSecret}:${timestamp}`)
  );
  const hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // Login
  const res = await fetch("https://api.skyslope.com/auth/login", {
    method: "POST",
    headers: {
      "Authorization": `SS ${accessKey}:${hmac}`,
      "Content-Type": "application/json",
      "Timestamp": timestamp,
    },
    body: JSON.stringify({ clientID: clientId, clientSecret: clientSecret }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SkySlope auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { session: data.Session, expiration: data.Expiration };
}
```

### Session Caching

Before calling `skyslopeAuth`, check `integration_credentials.session_token` and `session_expires_at`. If token exists and is valid for > 5 minutes, reuse it. Otherwise re-auth and update the row.

### CORS & Supabase Auth

Follow the same pattern as `google-auth/index.ts`:
- Check `Authorization: Bearer <supabase-jwt>` header
- Verify user is team owner (for setup actions) or team member (for verify-agent)
- Return proper CORS headers for OPTIONS preflight

---

## STEP 3: Create Listing Folder Edge Function

Create `supabase/functions/skyslope-create-listing/index.ts`. This is the core function.

### Input
```json
{ "listingId": "uuid", "userId": "uuid", "teamId": "uuid" }
```

### Full Flow

```typescript
// 1. Fetch RealtyGrind listing data
const { data: listing } = await supabase
  .from('listings')
  .select('*')
  .eq('id', listingId)
  .single();

// 2. Fetch attached documents
const { data: docs } = await supabase
  .from('listing_documents')
  .select('*')
  .eq('listing_id', listingId);

// 3. Fetch brokerage credentials
const { data: creds } = await supabase
  .from('integration_credentials')
  .select('*')
  .eq('team_id', teamId)
  .eq('provider', 'skyslope')
  .single();

// 4. Fetch agent keys
const { data: agentKeys } = await supabase
  .from('skyslope_agent_keys')
  .select('*')
  .eq('user_id', userId)
  .eq('team_id', teamId)
  .single();

// 5. Authenticate with SkySlope
const { session } = await skyslopeAuth(
  creds.credentials.clientId,
  creds.credentials.clientSecret,
  agentKeys.access_key,
  agentKeys.access_secret
);

// 6. Fetch dynamic form to know required fields
const formRes = await skyslopeFetch(session,
  `/api/files/listingForm?checklistTypeId=${creds.credentials.defaultChecklistTypeId}&officeGuid=${creds.credentials.defaultOfficeGuid}`
);

// 7. Parse listing address into components
const address = parseAddress(listing.address);
// parseAddress("142 Maple St, Eugene, OR 97401") →
//   { streetNumber: "142", streetAddress: "Maple St", city: "Eugene", state: "OR", zip: "97401" }

// 8. Create listing folder in SkySlope
const createRes = await skyslopeFetch(session, '/api/files/listings', {
  method: 'POST',
  body: {
    officeGuid: creds.credentials.defaultOfficeGuid,
    agentGuid: agentKeys.skyslope_agent_guid,
    checklistTypeId: creds.credentials.defaultChecklistTypeId,
    listingPrice: parseFloat(listing.price) || 0,
    listingDate: listing.list_date || new Date().toISOString(),
    expirationDate: listing.expires_date || sixMonthsFromNow(),
    mlsNumber: listing.mls_number || null,
    property: {
      streetNumber: address.streetNumber,
      streetAddress: address.streetAddress,
      city: address.city,
      state: address.state,
      zip: address.zip,
    },
  },
});
const listingGuid = createRes.value.listingGuid;

// 9. Upload each PDF document
for (const doc of docs) {
  // Download from Supabase Storage
  const { data: fileData } = await supabase.storage
    .from('listing-docs')
    .download(doc.storage_path);

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  // Upload to SkySlope
  const docRes = await skyslopeFetch(session,
    `/api/files/listings/${listingGuid}/documents`, {
    method: 'POST',
    body: {
      fileName: doc.file_name.substring(0, 150), // SkySlope 150 char limit
      base64Content: base64,
    },
  });

  // Save SkySlope document GUID back
  await supabase
    .from('listing_documents')
    .update({ skyslope_document_guid: docRes.value?.documentGuid })
    .eq('id', doc.id);
}

// 10. Add commission data if available
if (listing.commission) {
  const commPercent = parseFloat(listing.commission.replace('%', ''));
  if (!isNaN(commPercent)) {
    await skyslopeFetch(session,
      `/api/files/listings/${listingGuid}/commissions`, {
      method: 'POST',
      body: { listingCommissionPercent: commPercent },
    });
  }
}

// 11. Update RealtyGrind listing with SkySlope reference
await supabase
  .from('listings')
  .update({ skyslope_guid: listingGuid, skyslope_status: 'created' })
  .eq('id', listingId);

// 12. Return success
return { success: true, listingGuid };
```

### Helper: skyslopeFetch

```typescript
async function skyslopeFetch(session: string, path: string, options?: { method?: string; body?: any }) {
  const res = await fetch(`https://api.skyslope.com${path}`, {
    method: options?.method || 'GET',
    headers: {
      'Session': session,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  // Rate limit handling
  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') || '100');
  if (remaining < 5) {
    const reset = parseInt(res.headers.get('x-ratelimit-reset') || '0');
    const waitMs = Math.max(0, (reset * 1000) - Date.now());
    if (waitMs > 0) await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SkySlope API error (${res.status}) on ${path}: ${err}`);
  }

  return res.json();
}
```

### Address Parser

Implement a simple address parser that handles common formats:
- "142 Maple St, Eugene, OR 97401"
- "142 Maple Street Eugene OR 97401"
- "142 Maple St Unit 4, Eugene, OR 97401"

Return `{ streetNumber, streetAddress, unit, city, state, zip }`. This doesn't need to be perfect - agents can verify in SkySlope. Use a regex-based approach, not a geocoding API.

### Error Handling

- Wrap the entire flow in try/catch
- On failure, update `listings.skyslope_status = 'error'`
- Return structured error: `{ success: false, error: "...", step: "create-listing" }`
- If auth fails (401), clear cached session and return specific error
- If 422 validation error, parse SkySlope's error details and return them

---

## STEP 4: Frontend - PDF Upload on Listing Cards

Modify `src/App.jsx` to add PDF attachment to listings.

### State
```javascript
const [listingDocs, setListingDocs] = useState({}) // { [listingId]: [{ id, fileName, storagePath }] }
```

### Fetch listing documents alongside listings
When listings are loaded, also fetch:
```javascript
const { data: docs } = await supabase
  .from('listing_documents')
  .select('id, listing_id, file_name, storage_path, file_size, created_at')
  .in('listing_id', listings.map(l => l.id))
```
Group by `listing_id` into the `listingDocs` state.

### Upload handler
```javascript
async function uploadListingDoc(listingId, file) {
  if (file.type !== 'application/pdf') {
    showToast('Only PDF files are supported');
    return;
  }
  const path = `${user.id}/${listingId}/${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('listing-docs')
    .upload(path, file);
  if (uploadErr) { showToast('Upload failed'); return; }

  const { data, error } = await supabase
    .from('listing_documents')
    .insert({
      listing_id: listingId,
      user_id: user.id,
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
    })
    .select()
    .single();
  if (error) { showToast('Failed to save document'); return; }

  setListingDocs(prev => ({
    ...prev,
    [listingId]: [...(prev[listingId] || []), data],
  }));
  showToast('PDF attached');
}
```

### UI on listing card
Add below the existing listing fields (address, price, commission, dates):

```jsx
{/* Attached Documents */}
<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
  {(listingDocs[listing.id] || []).map(doc => (
    <span key={doc.id} style={{ fontSize: 11, background: 'var(--bg2)', padding: '2px 6px', borderRadius: 4 }}>
      📄 {doc.file_name}
      <button onClick={() => removeListingDoc(doc)} style={{ marginLeft: 4, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--muted)' }}>×</button>
    </span>
  ))}
  <label style={{ fontSize: 11, cursor: 'pointer', color: 'var(--gold)' }}>
    + Attach PDF
    <input type="file" accept=".pdf" hidden onChange={e => {
      if (e.target.files[0]) uploadListingDoc(listing.id, e.target.files[0]);
      e.target.value = '';
    }} />
  </label>
</div>

{/* Generate Listing Folder button */}
{skyslopeEnabled && agentKeysPaired && (
  listing.skyslope_status === 'created' ? (
    <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ SkySlope folder created</span>
  ) : (
    <button
      className="btn-outline"
      style={{ fontSize: 11, padding: '3px 8px', marginTop: 4 }}
      disabled={!(listingDocs[listing.id] || []).length || !listing.address || !listing.price || generatingFolder === listing.id}
      onClick={() => generateSkySlopeFolder(listing.id)}
      title={!(listingDocs[listing.id] || []).length ? 'Attach a PDF first' : !listing.address ? 'Address required' : ''}
    >
      {generatingFolder === listing.id ? 'Creating...' : '📂 Generate Listing Folder'}
    </button>
  )
)}
```

### Generate handler
```javascript
const [generatingFolder, setGeneratingFolder] = useState(null);

async function generateSkySlopeFolder(listingId) {
  setGeneratingFolder(listingId);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/skyslope-create-listing`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ listingId, userId: user.id, teamId: profile.team_id }),
    });
    const result = await res.json();
    if (result.success) {
      setListings(prev => prev.map(l =>
        l.id === listingId ? { ...l, skyslope_guid: result.listingGuid, skyslope_status: 'created' } : l
      ));
      showToast('Listing folder created in SkySlope!');
    } else {
      showToast('SkySlope error: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    showToast('Failed to create SkySlope folder');
    console.error('SkySlope create error:', err);
  }
  setGeneratingFolder(null);
}
```

---

## STEP 5: Frontend - Brokerage SkySlope Settings

Add to `src/pages/TeamsPage.jsx` in the Settings section. Only visible when `team.plan === 'brokerage'` and user is owner.

### New settings tab: "Integrations"

**Card: SkySlope Transaction Management**

States and UI:
1. **Not configured:** Show credential form (Client ID, Client Secret as password inputs) + "Test Connection" button
2. **Testing:** Loading spinner, "Testing connection..."
3. **Tested OK:** Show green check, then dropdowns for Default Office (from `GET /api/offices`) and Listing Template (from `GET /api/offices/{guid}/checklistTypes`) + "Save & Enable" button
4. **Enabled:** Show green "Connected" badge, office name, template name, "Disconnect" button
5. **Error:** Show red error message with retry option

### Data flow
- Test: call `skyslope-setup` with `action: "test-connection"`
- List offices: call with `action: "list-offices"`
- List templates: call with `action: "list-checklist-types"` + officeGuid
- Save: upsert to `integration_credentials` with all selected values
- Disconnect: update `is_active = false`

### Agent pairing status table
Below the credential card, show a table of team members and their SkySlope pairing status:
- Name | Email | SkySlope Status (Paired ✓ / Not Paired)
- This helps the broker see who still needs to connect their keys

---

## STEP 6: Frontend - Agent Key Pairing

Add to `src/pages/ProfilePage.jsx` in a new "Integrations" section (only visible if the agent's team has SkySlope enabled).

**Card: Connect Your SkySlope Account**
1. Two password inputs: Access Key, Access Secret
2. "Connect" button → calls `skyslope-setup` with `action: "verify-agent"`
3. On success: saves to `skyslope_agent_keys`, shows green "Connected as [Name]"
4. "Disconnect" button to remove keys

---

## STEP 7: Update plans.js

In `src/lib/plans.js`, add SkySlope to the brokerage plan features:

```javascript
// In the brokerage plan definition, add to features array:
'SkySlope listing folder generation'
```

Add a helper:
```javascript
export function hasSkySlope(plan) {
  return plan === 'brokerage';
}
```

---

## STEP 8: Testing

1. **HMAC auth:** Write a test that generates an HMAC matching SkySlope's Node.js example from the swagger docs
2. **Connection test:** Use real sandbox credentials to verify auth + office listing
3. **Create folder:** Create a test listing in RealtyGrind with a PDF, generate folder, verify in SkySlope
4. **Edge cases:**
   - Listing without PDF → button disabled
   - Listing without address → button disabled
   - Agent without paired keys → button hidden
   - Brokerage without SkySlope enabled → no SkySlope UI anywhere
   - Large PDF (>10MB) → handle gracefully
   - Rate limit → backoff works
   - Expired session → auto re-auth
   - Already generated → shows status, no duplicate button

---

## Important Implementation Notes

- **Read the swagger spec** at `/Users/derikbannister9/Downloads/swagger.json` for exact request/response schemas
- **Always fetch the listingForm endpoint** before creating a listing - SkySlope has dynamic required fields per brokerage that can change
- **Document upload is base64** - the `base64Content` field must be valid base64 of the PDF bytes
- **150 character limit** on `fileName` in SkySlope document uploads
- **Agent GUID discovery:** After auth, call `GET /api/users` - the agentGuid is the `userGuid` field on the user object that matches the authenticating user's email
- **Session tokens are 2 hours** - cache aggressively, refresh proactively
- **Follow existing code patterns** in the codebase - especially the CORS/auth pattern from google-auth, the Supabase Storage pattern from the avatars feature, and the settings UI pattern from TeamsPage
- **Brokerage plan gating** - all SkySlope UI should be hidden unless `team.plan === 'brokerage'`
- **Never send credentials to the client** - after initial save, the client only sees `isActive`, `officeName`, `templateName`
