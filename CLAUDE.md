@AGENTS.md

# MapCrowd — Project Context

## What this is
A crowd-sourced mapping platform where users drop geo-tagged pins into thematic communities (like "Birds", "Street Art", "Free WiFi"). Think Reddit meets Google Maps. Built with Next.js 16 + Supabase.

## Tech stack
- **Framework**: Next.js 16.2.6 (App Router, Turbopack)
- **Database + Auth**: Supabase (PostgreSQL, RLS, Realtime, Storage)
- **Map**: Leaflet via `react-leaflet`, with `leaflet.markercluster` for pin clustering
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **Language**: TypeScript

## Running locally
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build check
```

`.env.local` needs two variables — get them from Supabase dashboard → Settings → API Keys → Legacy:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co   # must include https://
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Critical**: The URL must include `https://` — the Supabase SDK v2 rejects bare hostnames with "Must be a valid HTTP or HTTPS URL".

## Project structure
```
app/
  page.tsx                  # Main map page ('use client') — all state lives here
  layout.tsx                # Root layout with fonts
  not-found.tsx             # Branded 404
  c/[slug]/
    layout.tsx              # SEO metadata (server component)
    page.tsx                # Community page ('use client')
  u/[username]/
    layout.tsx              # SEO metadata (server component)
    page.tsx                # Public profile page ('use client')

components/
  Sidebar.tsx               # Left sidebar: community list, search, user auth
  MapWrapper.tsx            # SSR-safe Leaflet wrapper (dynamic import, no SSR)
  MapInner.tsx              # Actual Leaflet map + marker logic + FlyToController
  PinClusterLayer.tsx       # Marker clustering layer
  PinDetailModal.tsx        # Pin detail drawer: voting, comments, photos
  AddPinModal.tsx           # Drop-a-pin form
  AuthModal.tsx             # Sign in / sign up modal
  CreateCommunityModal.tsx  # New community form with duplicate/similar name detection
  CommunitySettingsModal.tsx # Owner/mod settings: queue, rules, mods
  SearchModal.tsx           # Cmd/Ctrl+K command palette search (communities + pins)
  LocationSearch.tsx        # Top-right map geocoding search (Nominatim, no API key)
  Avatar.tsx                # Shared avatar component (image or initials fallback)
  ActivityFeed.tsx          # Sidebar "Feed" tab: unified feed (followed users + subscribed communities)
  BottomNav.tsx             # Mobile-only persistent bottom tab bar (Map/Discover/Feed/Profile)
  MapStyleSwitcher.tsx      # Light/Dark/Satellite tile picker (bottom-left of map)
  QuickAddSheet.tsx         # GPS quick-add: reverse-geocode + nearby POIs (Overpass), pre-filled sheet

lib/
  supabase.ts               # Supabase client (validates env vars at startup)
  types.ts                  # Shared TypeScript types (Community, Pin, etc.)
  utils.ts                  # Shared helpers: timeAgo, formatEventDate, avatarColor, formatCount, canUserPinInCommunity
  geo.ts                    # OSM geocoding: reverseGeocode, formatAddress, nearbyPlaces (Overpass), distanceMeters
  session.ts                # Anonymous session ID (legacy; voting is now auth-based)

supabase/
  schema-current.sql                     # ← USE THIS for a fresh Supabase project (single file, full state)
  # Incremental migrations (already applied to the live DB — history only):
  00-base-schema-migration.sql
  01-moderation-migration.sql
  02-community-settings-migration.sql
  03-comments-migration.sql
  04-photos-and-community-page-migration.sql
  05-search-profiles-migration.sql
  06-private-communities.sql
  07-email-invites.sql
  08-reseed-sample-communities.sql       # seed only — safe to skip on fresh setup
  09-fix-communities-rls-recursion.sql
  10-owner-as-default-mod.sql
  11-mod-rename-community.sql
  12-mod-invite-by-email.sql
  13-geo-restriction.sql
  14-geo-approval-trigger.sql
  15-community-groups.sql
  16-anonymous-pins.sql
  17-events-rsvp.sql
  18-community-tags.sql
  19-pin-tags-delete.sql
  20-mod-helper.sql
  21-follows.sql
  22-security-hardening.sql               # XSS CHECK constraints + SECURITY DEFINER search_path
  23-abuse-and-admin-hardening.sql        # rate limits, auth-based votes, real site-admin RLS
  24-pin-links-and-edit.sql               # pins.url + update_pin() editor RPC
  25-saved-pins.sql                       # saved_pins (private bookmarks) + RLS
  26-harden-pin-insert.sql                # force vote_count=0 + policy-derived expires_at on insert
  27-collections.sql                      # collections + collection_pins (named lists) + RLS
  28-routes.sql                           # routes + route_pins (ordered trails) + RLS
  # Superseded — do not run:
  schema.sql
  auth-migration.sql
  community-creation-migration.sql
```

## Database schema (high level)
| Table | Purpose |
|---|---|
| `profiles` | Public user profiles, auto-created on signup via trigger |
| `communities` | Map communities with color, icon, slug, settings, privacy, geo restriction |
| `community_groups` | Sidebar folders for organising subscriptions |
| `community_members` | Private-community membership (pending / accepted) |
| `community_email_invites` | Pending invites for not-yet-registered emails |
| `community_moderators` | Mod assignments per community |
| `community_subscriptions` | User subscriptions (with optional group_id folder) |
| `community_tags` | Mod-defined tag vocabulary per community |
| `pins` | Geo-tagged posts; nullable user_id (anonymous); optional event fields |
| `pin_tags` | Many-to-many: pins ↔ community_tags |
| `votes` | Votes (+1/-1) — authenticated, one per (pin, user); written only via `vote_on_pin()` |
| `site_admins` | Super-users (user_id PK); read only by `is_site_admin()` — no direct RLS access |
| `comments` | Comments on pins |
| `pin_photos` | Photo uploads linked to pins (stored in `pin-photos` Storage bucket) |
| `event_rsvps` | "Going" RSVPs for event pins (one per user per pin) |
| `follows` | User social graph: follower_id → followee_id (public, self-managed) |
| `saved_pins` | Private per-user bookmarks (user_id, pin_id); RLS own-rows-only |
| `collections` | User-named lists; RLS own-rows-only |
| `collection_pins` | Membership: a pin in a collection (a pin can be in many) |
| `routes` | Ordered trails (name, color); RLS own-rows-only |
| `route_pins` | Ordered stops in a route (route_id, pin_id, position) |

Key RPCs:
- `vote_on_pin(p_pin_id, p_session_id, p_value)` — SECURITY DEFINER, handles toggle/switch/new votes
- `toggle_event_rsvp(p_pin_id)` — SECURITY DEFINER, toggles RSVP; enforces capacity
- `get_community_stats(p_community_id)` — pin count + subscriber count
- `get_profile_stats(p_user_id)` — pin count, total votes, community count
- `rename_community(p_community_id, p_new_name)` — owner or mod only
- `add_mod_by_email(p_community_id, p_email)` — adds mod by email; reads auth.users
- `find_profile_by_email(p_email)` — server-side only (service role); used by /api/invite

Key helper functions (SECURITY DEFINER):
- `is_site_admin()` — TRUE if caller is in `site_admins` (seed it to match `NEXT_PUBLIC_ADMIN_USER_ID`)
- `is_community_mod(community_id)` — TRUE if caller is a site admin, the owner, or an assigned mod
- `is_pin_owner_or_mod(pin_id)` — TRUE if caller is pin author or community mod
- `can_user_pin_in_community(community_id)` — enforces who_can_pin; handles anonymous
- `check_community_member(community_id)` — breaks communities ↔ community_members RLS recursion

### Security model notes
- **All SECURITY DEFINER functions pin `search_path = public`** (migration 22). Keep it on any new one.
- **Voting is authenticated + one-per-user.** `votes` has no direct write policies — `vote_on_pin()` (SECURITY DEFINER, requires `auth.uid()`) is the only writer; clients read their own row via `votes_select_own`. Keying on `auth.uid()` (not the client `session_id`) prevents vote stuffing.
- **Site admin is real RLS**, not client-only: `is_site_admin()` feeds `is_community_mod()` (admin = mod everywhere) plus the community update/delete and mod-management policies. Seed `site_admins` with your admin UUID.
- **Rate limits** (migration 23): authenticated pin creation (10/min, 100/hr) and follows (30/min) are capped by BEFORE INSERT triggers. Anonymous pins aren't per-actor trackable in Postgres — IP-based limiting needs an edge/middleware layer.
- **Map markers render raw HTML** (Leaflet `divIcon`). Any DB value interpolated there MUST be sanitized — `PinClusterLayer` uses `safeColor()` + `escapeHtml()`, backed by `CHECK` constraints on `communities.color/icon`.

## Architecture decisions & gotchas

### Next.js 16 specifics
- `params` in `generateMetadata` is `Promise<{...}>` — must be `await`ed
- `generateMetadata` can only be exported from Server Components — client pages use a sibling `layout.tsx` for SEO
- Client components (with `'use client'`) are still SSR'd during build; module-level Supabase client creation runs at prerender time, so env vars must be valid

### Supabase RLS
- `vote_on_pin()` is SECURITY DEFINER — it does NOT need an UPDATE policy on `pins`
- There is intentionally NO `pins_update_vote_count` policy (removed as a security hole — it allowed any user to UPDATE any pin directly)
- The `pins_insert_auth` policy name is referenced by `02-community-settings-migration.sql` (drops it by name), so the name must match exactly
- `community_subscriptions` SELECT is RLS-restricted to own rows — `get_community_stats()` is SECURITY DEFINER to count subscribers publicly

### Supabase client in layouts
- `app/c/[slug]/layout.tsx` and `app/u/[username]/layout.tsx` create the Supabase client **inside** `generateMetadata()`, not at module level — this prevents build crashes when env vars aren't set yet

### Mobile sidebar & z-index
- Sidebar is a fixed drawer on mobile, permanently visible on `md:` breakpoint
- State: `showMobileSidebar` in `app/page.tsx`
- **Critical**: Leaflet internally uses z-indices up to ~1000 for tiles, markers, popups, controls. Any UI element above the map must use `z-[1100]` or higher. Tailwind's `z-50` (50) is NOT enough.

#### Layering scale (keep these tiers consistent)
| Tier | z-index | What |
|---|---|---|
| Map base | ≤ 1000 | Leaflet tiles / markers / zoom control (internal) |
| Map controls | `z-[1100]` | Hamburger, LocationSearch, Near Me, mobile FAB, BottomNav |
| Community panel | `z-[1150]` | `CommunityPinsPanel` (bottom sheet on mobile, side column on desktop) |
| Mid modals | `z-[1200]` | `AddPinModal`, `PinDetailModal`, `CreateCommunityModal` |
| Top modals | `z-[1300]` | `AuthModal`, `SearchModal`, `CommunitySettingsModal` |
| Mobile sidebar | `z-[1400]` backdrop / `z-[1401]` drawer | nav drawer (drawer drops to `z-auto` on `md:`) |

- **Map controls hide when an overlay is open.** `app/page.tsx` derives `panelOpen` / `modalOpen` / `overlayOpen`; the hamburger, FAB, Near Me, and `BottomNav` are gated on `overlayOpen`, and `LocationSearch` is unmounted while `modalOpen`. This prevents the floating controls from rendering on top of a sheet on mobile.

### Mobile bottom navigation
- `BottomNav` (`md:hidden`, `z-[1100]`) is a persistent tab bar: **Map / Discover / Feed / Profile**. Rendered in `app/page.tsx`, hidden when `overlayOpen`.
- "Feed" opens the mobile sidebar pre-set to its Feed tab — the sidebar's tab state is **lifted into `app/page.tsx`** (`sidebarTab` / `setSidebarTab`, values `'communities' | 'feed'`) and passed to `Sidebar` as `tab` / `onTabChange` so the nav can switch it.
- "Profile" links to `/u/<myUsername>` (fetched from `profiles` for the signed-in user) or opens the auth modal when signed out.
- The bottom-right map controls (Near Me `bottom-20 md:bottom-8`, FAB `bottom-36 md:bottom-28`) and Leaflet's bottom controls (`globals.css` shifts `.leaflet-bottom` up `3.5rem` on mobile) are raised to clear the 56px nav.

### Modals are bottom sheets on mobile
- All modals use the pattern: outer `flex items-end ... sm:items-center sm:p-4`, inner `rounded-t-2xl sm:rounded-2xl` with a `sm:hidden` drag-handle and `maxHeight: 90vh`.
- Applies to `AddPinModal`, `PinDetailModal`, `AuthModal`, `CreateCommunityModal`, `CommunitySettingsModal`. Keep new modals consistent with this.

### LocationSearch (geocoding)
- Uses **Nominatim** (OpenStreetMap) — free, no API key, rate limit ~1 req/s
- 500 ms debounce in the browser satisfies the rate limit per-user
- `bboxZoom()` derives zoom from the result's bounding box so cities/neighbourhoods/countries all land at an appropriate zoom level
- `FlyToTarget` has a monotonically-increasing `id` field — the `FlyToController` inside `MapContainer` watches `target` by reference, so passing a new object (even with same coords) always triggers a new `flyTo`
- `LocationSearch` is rendered as `absolute right-4 top-4 z-[1001]` inside `<main className="relative flex-1">` so it stays top-right of the map on both desktop (next to sidebar) and mobile (full width)
- `onMouseDown` with `e.preventDefault()` is used in the dropdown buttons to prevent the input from losing focus before the click registers

### Avatar component
- `className` prop carries size, shape, AND text size (e.g. `"h-8 w-8 rounded-full text-xs"`)
- Falls back to colored initials if no `src`
- Color is deterministic: `avatarColor(userId)` from `lib/utils.ts`

### Search
- `SearchModal` (Cmd/Ctrl+K): communities filtered client-side, pins searched via Supabase ILIKE with 200ms debounce
- Keyboard nav: ↑↓ arrows, Enter to select, Escape to close

### Community creation
- Any logged-in user can create a community via the `+` button in the sidebar community list header
- `CreateCommunityModal` runs a debounced (350 ms) Supabase ILIKE search on the name field
- Exact name match (case-insensitive) → red error, Create button disabled
- Similar names → yellow warning, creation still allowed (to support e.g. "Free Bathrooms Portland" vs "Free Bathrooms New York")
- `toSlug()` appends a 4-char random suffix so slugs stay unique even with identical names

## Deployment
- **GitHub**: https://github.com/snowwarrior1-alt/Mapper
- **Hosting**: Vercel (connected to GitHub repo, auto-deploys on push to `main`)
- **Live URL**: https://mapper-gamma.vercel.app/
- **Database**: Supabase project `tmycdgnofvmbyrmpqohw` (AWS us-west-2)

### Vercel env vars required
```
NEXT_PUBLIC_SUPABASE_URL=https://tmycdgnofvmbyrmpqohw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
```

### Auth
- Google OAuth enabled via Supabase Auth
- Callback URL: `https://tmycdgnofvmbyrmpqohw.supabase.co/auth/v1/callback`
- Supabase → Authentication → URL Configuration: Site URL and Redirect URLs set to `https://mapper-gamma.vercel.app/**`

### Running SQL migrations
**Fresh project**: run `schema-current.sql` — one file, full schema.
**Existing project**: run any numbered files you haven't applied yet (00 → 20), in order. All use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` so they're safe to re-run.

## Features built
- Interactive Leaflet map with pin clustering
- Community sidebar with subscribe, filter, settings
- Drop pins with title, description, community, optional expiry
- **Anonymous pins** — no account needed in `who_can_pin = 'anyone'` communities
- Upvote/downvote pins (anonymous, session-scoped)
- Comments on pins
- Photo uploads to pins (Supabase Storage)
- Community moderation queue (approve/reject pending pins)
- Community settings: who_can_pin, require_approval, default_pin_duration
- **Geographic area restriction** — pins outside the area go into mod queue
- Moderator management (owners assign mods by username or email)
- Sidebar community folders (drag-and-drop grouping)
- Cmd/Ctrl+K search modal (communities + pins)
- Public community pages at `/c/[slug]`
- Public user profile pages at `/u/[username]`
- Google OAuth sign-in
- **Private communities** — invite-only via username or email; non-members can't see pins
- Mobile-responsive sidebar drawer (hamburger top-left on mobile)
- Real-time updates (Supabase Realtime channels)
- Custom 404 page
- SEO metadata (OpenGraph + Twitter cards) on community and profile pages
- Any logged-in user can create communities (with duplicate/similar name detection)
- **Geocoding / map search**: top-right search bar flies the map to any place in the world (Nominatim)
- **Events / meetups** — event pins with date/time/capacity; Going RSVP; 📅 badge on map marker
- **Community-managed tags** — mods define tag vocabulary; pinners multi-select tags; edit tags inline on existing pins
- **Discover page** (`/discover`) — browse/search/sort all public communities; subscribe inline
- **Near Me** — geolocation button flies the map to the user's location
- **User follows** — follow other mappers; followed users' pins get a ⭐ badge + amber ring on the map; follower/following counts + Follow button on profile pages
- **Unified activity feed** — Sidebar "Feed" tab (and bottom-nav Feed) merges pins from followed users + subscribed communities, newest first, each tagged with why it's there (⭐ followed / 🔖 subscribed). Computed client-side from `pins` + `followedUserIds` + `subscribedIds` — no extra queries
- **Map style switcher** — Light / Dark / Satellite tiles (`MapStyleSwitcher`, persisted to localStorage); tile presets in `MapInner` (`TILE_PRESETS`)
- **Pin editing** — author or mod/admin edits title/description/url inline in the detail modal via the `update_pin()` RPC (column-restricted; can't touch status/votes/community)
- **External links on pins** — optional `pins.url` (http/https, CHECK-constrained + client-validated `safeUrl`); shown as a "Visit site" button in the detail modal
- **Tag filtering** — filter chips in `CommunityPinsPanel` narrow the map + list to pins carrying the selected community tags (`selectedTagIds`; pins carry `tag_ids` from the `pin_tags` join)
- **Shareable pin links** — `/?pin=<id>` opens + flies to a pin on load; "Share" button in the detail modal copies the link
- **Quick add** — the mobile FAB opens `QuickAddSheet`: grabs GPS, reverse-geocodes the address (Nominatim) and lists nearby named POIs (Overpass API) so you can tap the bar/cafe you're standing in. Pre-fills title from the chosen place; defaults the community to the focused/last-used one (`lastCommunityId` in localStorage); "More options" hands off to the full `AddPinModal`. A "how it works" explainer auto-shows on first use (`quickAddHelpSeen` in localStorage) and is re-openable via the header **?** button
- **Community pin search** — `CommunityPinsPanel` shows a search box (once a community has >5 pins) that filters the list by title/description, composing with the tag filter
- **Saved pins** — private per-user bookmarks spanning any community; Save toggle in the pin detail modal, a "Saved" global filter in the sidebar (map filters to saved pins), tracked as `savedPinIds` in `app/page.tsx`
- **Named collections** — user-curated lists (`collections` + `collection_pins`); "Lists" button in the pin detail modal adds/removes a pin and creates new lists; sidebar "Collections" section lists/creates/renames/deletes them and filters the map to a list's pins
- **Per-community map visibility** — an eye toggle on each sidebar community row hides/shows that community's pins on the map, independent of subscribing. Device preference in localStorage (`hiddenCommunityIds`); applies to the "All" / "My Subscriptions" aggregate views only (explicit community/saved/collection selections always show what was asked)
- **Routes / trails** — ordered pin sequences (`routes` + `route_pins`) drawn as a polyline (`MapInner` `<Polyline>` + auto-fit bounds). Sidebar "Routes" section creates/opens them; `RoutePanel` shows numbered stops with reorder/remove and an "Add stops" build mode where tapping map pins appends them in order (`routeBuildMode` in `app/page.tsx` intercepts pin clicks)
- **Mobile-streamlined UX** — coherent z-index layering; floating controls hide under overlays; all modals are bottom sheets on mobile; persistent bottom tab bar (Map/Discover/Following/Profile)
