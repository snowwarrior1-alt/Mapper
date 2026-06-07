'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Menu, Plus, LocateFixed, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ADMIN_USER_ID } from '@/lib/constants'
import { Community, Pin, PendingInvite, CommunityGroup, Collection, Route } from '@/lib/types'
import type { FlyToTarget } from '@/components/MapInner'
import Sidebar from '@/components/Sidebar'
import MapWrapper from '@/components/MapWrapper'
import LocationSearch from '@/components/LocationSearch'
import AddPinModal from '@/components/AddPinModal'
import PinDetailModal from '@/components/PinDetailModal'
import AuthModal from '@/components/AuthModal'
import CreateCommunityModal from '@/components/CreateCommunityModal'
import CommunitySettingsModal from '@/components/CommunitySettingsModal'
import CommunityPinsPanel from '@/components/CommunityPinsPanel'
import RoutePanel from '@/components/RoutePanel'
import SearchModal from '@/components/SearchModal'
import BottomNav from '@/components/BottomNav'
import MapStyleSwitcher from '@/components/MapStyleSwitcher'
import QuickAddSheet from '@/components/QuickAddSheet'
import type { MapStyle } from '@/components/MapInner'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [communitySettingsId, setCommunitySettingsId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyToCounter = useRef(0)
  // Tracks whether user has manually chosen a filter; prevents auto-default from overriding choices
  const userChoseFilter = useRef(false)

  const [communities, setCommunities] = useState<Community[]>([])
  const [pins, setPins] = useState<Pin[]>([])
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)
  const [showSubscribedOnly, setShowSubscribedOnly] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  // Per-community map visibility (device preference; independent of subscribe)
  const [hiddenCommunityIds, setHiddenCommunityIds] = useState<Set<string>>(new Set())
  const [pendingLatLng, setPendingLatLng] = useState<[number, number] | null>(null)
  const [pendingCommunityOverride, setPendingCommunityOverride] = useState<string | null>(null)
  const [pendingPinTitle, setPendingPinTitle] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([30, 10]) // matches MapInner initial center
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)

  // Moderation, subscriptions & invites
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [modCommunityIds, setModCommunityIds] = useState<Set<string>>(new Set())
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  // User IDs the current user follows
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set())
  // Pin IDs the current user has saved (private bookmarks)
  const [savedPinIds, setSavedPinIds] = useState<Set<string>>(new Set())
  // Named collections + the currently-filtered collection
  const [collections, setCollections] = useState<Collection[]>([])
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [activeCollectionPinIds, setActiveCollectionPinIds] = useState<Set<string>>(new Set())
  // Routes/trails — the open route, its ordered stops, and build mode
  const [routes, setRoutes] = useState<Route[]>([])
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null)
  const [routeStops, setRouteStops] = useState<{ pin: Pin; position: number }[]>([])
  const [routeBuildMode, setRouteBuildMode] = useState(false)
  // Current user's profile username (for the bottom-nav Profile link)
  const [myUsername, setMyUsername] = useState<string | null>(null)
  // Which list the sidebar shows — lifted here so the bottom nav can switch it
  const [sidebarTab, setSidebarTab] = useState<'communities' | 'feed'>('communities')
  // Map tile style (persisted)
  const [mapStyle, setMapStyle] = useState<MapStyle>('light')
  // Tag filter (community-scoped) — empty = show all
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

  // Load persisted map style on mount
  useEffect(() => {
    const saved = localStorage.getItem('mapStyle')
    if (saved === 'light' || saved === 'dark' || saved === 'satellite') setMapStyle(saved)
  }, [])

  const handleMapStyleChange = (style: MapStyle) => {
    setMapStyle(style)
    localStorage.setItem('mapStyle', style)
  }

  // Load persisted hidden-community set on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hiddenCommunityIds') ?? '[]')
      if (Array.isArray(saved)) setHiddenCommunityIds(new Set(saved))
    } catch { /* ignore */ }
  }, [])

  const handleToggleCommunityVisibility = (id: string) => {
    setHiddenCommunityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('hiddenCommunityIds', JSON.stringify([...next]))
      return next
    })
  }

  // Community groups (personal folders for organising subscriptions)
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  // Maps communityId → groupId (null = ungrouped). Only includes subscribed communities.
  const [communityGroupMap, setCommunityGroupMap] = useState<Map<string, string | null>>(new Map())

  // Communities this user owns (derived from communities list)
  const ownedCommunityIds = useMemo(
    () => new Set(communities.filter((c) => c.created_by === user?.id).map((c) => c.id)),
    [communities, user]
  )

  // Site-wide admin — can delete any community
  const isAdmin = !!user && !!ADMIN_USER_ID && user.id === ADMIN_USER_ID

  // All communities this user can moderate (owner OR assigned mod)
  const moderatedIds = useMemo(
    () => new Set([...ownedCommunityIds, ...modCommunityIds]),
    [ownedCommunityIds, modCommunityIds]
  )

  // True if the user can moderate the given community (owner or assigned mod)
  const canModerate = useCallback(
    (communityId: string) => moderatedIds.has(communityId),
    [moderatedIds]
  )

  // ── Auth state ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowAuthModal(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch((v) => !v)
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Subscriptions & mod roles — refresh whenever auth changes ─────────────
  const fetchSubscriptions = useCallback(async () => {
    if (!user) {
      setSubscribedIds(new Set())
      setCommunityGroupMap(new Map())
      return
    }
    const { data } = await supabase
      .from('community_subscriptions')
      .select('community_id, group_id')
      .eq('user_id', user.id)
    if (data) {
      setSubscribedIds(new Set(data.map((s) => s.community_id)))
      setCommunityGroupMap(new Map(data.map((s) => [s.community_id, s.group_id ?? null])))
    }
  }, [user])

  const fetchModRoles = useCallback(async () => {
    if (!user) { setModCommunityIds(new Set()); return }
    const { data } = await supabase
      .from('community_moderators')
      .select('community_id')
      .eq('user_id', user.id)
    if (data) setModCommunityIds(new Set(data.map((m) => m.community_id)))
  }, [user])

  const fetchFollowing = useCallback(async () => {
    if (!user) { setFollowedUserIds(new Set()); return }
    const { data } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', user.id)
    if (data) setFollowedUserIds(new Set(data.map((f) => f.followee_id)))
  }, [user])

  const fetchSaved = useCallback(async () => {
    if (!user) { setSavedPinIds(new Set()); return }
    const { data } = await supabase
      .from('saved_pins')
      .select('pin_id')
      .eq('user_id', user.id)
    if (data) setSavedPinIds(new Set(data.map((s) => s.pin_id)))
  }, [user])

  const fetchCollections = useCallback(async () => {
    if (!user) { setCollections([]); return }
    const { data } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (data) setCollections(data as Collection[])
  }, [user])

  const fetchRoutes = useCallback(async () => {
    if (!user) { setRoutes([]); return }
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (data) setRoutes(data as Route[])
  }, [user])

  const fetchMyUsername = useCallback(async () => {
    if (!user) { setMyUsername(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()
    setMyUsername(data?.username ?? null)
  }, [user])

  const fetchPendingInvites = useCallback(async () => {
    if (!user) { setPendingInvites([]); return }
    const { data } = await supabase
      .from('community_members')
      .select('id, community_id, community:communities(name, icon, color)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
    if (data) setPendingInvites(data as unknown as PendingInvite[])
  }, [user])

  const fetchGroups = useCallback(async () => {
    if (!user) { setGroups([]); return }
    const { data } = await supabase
      .from('community_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('position')
      .order('created_at')
    if (data) setGroups(data)
  }, [user])

  useEffect(() => { fetchSubscriptions() }, [fetchSubscriptions])
  useEffect(() => { fetchModRoles() }, [fetchModRoles])
  useEffect(() => { fetchPendingInvites() }, [fetchPendingInvites])
  useEffect(() => { fetchGroups() }, [fetchGroups])
  useEffect(() => { fetchFollowing() }, [fetchFollowing])
  useEffect(() => { fetchSaved() }, [fetchSaved])
  useEffect(() => { fetchCollections() }, [fetchCollections])
  useEffect(() => { fetchRoutes() }, [fetchRoutes])
  useEffect(() => { fetchMyUsername() }, [fetchMyUsername])

  // Reset manual-filter flag when auth changes, and clear subscribed view on sign-out
  useEffect(() => {
    userChoseFilter.current = false
    if (!user) {
      setShowSubscribedOnly(false)
      setShowSavedOnly(false)
      setActiveCollectionId(null)
      setActiveRouteId(null)
      setRouteStops([])
      setRouteBuildMode(false)
      setSelectedCommunity(null)
      setGroups([])
      setCommunityGroupMap(new Map())
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-default logged-in users with subscriptions to the subscribed-only view
  useEffect(() => {
    if (userChoseFilter.current) return
    if (user && subscribedIds.size > 0) {
      setShowSubscribedOnly(true)
      setSelectedCommunity(null)
    }
  }, [user, subscribedIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the Saved view automatically once the last save is removed
  useEffect(() => {
    if (showSavedOnly && savedPinIds.size === 0) setShowSavedOnly(false)
  }, [showSavedOnly, savedPinIds])

  // ── Data ──────────────────────────────────────────────────────────────────
  const fetchCommunities = useCallback(async () => {
    const { data } = await supabase.from('communities').select('*').order('name')
    if (data) setCommunities(data)
  }, [])

  useEffect(() => { fetchCommunities() }, [fetchCommunities])

  useEffect(() => {
    const channel = supabase
      .channel('communities-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communities' }, () =>
        fetchCommunities()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchCommunities])

  const fetchPins = useCallback(async () => {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('pins')
      .select('*, community:communities(*), profile:profiles(username, avatar_url), pin_tags(tag_id)')
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
    if (data) {
      // Flatten the pin_tags join into a string[] of tag ids for filtering
      setPins(
        data.map((p) => {
          const { pin_tags, ...pin } = p as Pin & { pin_tags?: { tag_id: string }[] }
          return { ...pin, tag_ids: (pin_tags ?? []).map((t) => t.tag_id) }
        })
      )
    }
  }, [])

  useEffect(() => { fetchPins() }, [fetchPins])

  useEffect(() => {
    const channel = supabase
      .channel('pins-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, () => fetchPins())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPins])

  // Deep link: /?pin=<id> opens that pin and flies to it (once, on mount)
  useEffect(() => {
    const pinId = new URLSearchParams(window.location.search).get('pin')
    if (!pinId) return
    supabase
      .from('pins')
      .select('*, community:communities(*), profile:profiles(username, avatar_url), pin_tags(tag_id)')
      .eq('id', pinId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const { pin_tags, ...rest } = data as Pin & { pin_tags?: { tag_id: string }[] }
        const pin = { ...rest, tag_ids: (pin_tags ?? []).map((t) => t.tag_id) } as Pin
        setSelectedPin(pin)
        handleFlyTo(pin.lat, pin.lng, 16)
        // Clean the query string so a refresh/back doesn't reopen it
        window.history.replaceState({}, '', window.location.pathname)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Interaction handlers ──────────────────────────────────────────────────

  const handleSelectCommunity = (id: string | null) => {
    userChoseFilter.current = true
    setSelectedCommunity(id)
    setShowSubscribedOnly(false)
    setShowSavedOnly(false)
    setActiveCollectionId(null)
    if (id) { setActiveRouteId(null); setRouteStops([]); setRouteBuildMode(false) } // route panel yields the slot
    setSelectedTagIds(new Set()) // tags are community-scoped — reset on switch
  }

  const handleShowSubscribed = () => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(true)
    setShowSavedOnly(false)
    setActiveCollectionId(null)
    setSelectedTagIds(new Set())
  }

  const handleShowSaved = () => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(false)
    setShowSavedOnly(true)
    setActiveCollectionId(null)
    setSelectedTagIds(new Set())
  }

  const handleSelectCollection = async (id: string) => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(false)
    setShowSavedOnly(false)
    setSelectedTagIds(new Set())
    setActiveCollectionId(id)
    const { data } = await supabase.from('collection_pins').select('pin_id').eq('collection_id', id)
    setActiveCollectionPinIds(new Set((data ?? []).map((r) => r.pin_id)))
  }

  const filteredPins = useMemo(() => {
    let result: Pin[]
    // Explicit selections (a single community, a collection, or saved) show exactly
    // what was asked for; the per-community visibility toggle only mutes the broad
    // "All" / "My Subscriptions" aggregate views.
    const explicit = !!selectedCommunity || !!activeCollectionId || showSavedOnly
    if (selectedCommunity) result = pins.filter((p) => p.community_id === selectedCommunity)
    else if (activeCollectionId) result = pins.filter((p) => activeCollectionPinIds.has(p.id))
    else if (showSavedOnly) result = pins.filter((p) => savedPinIds.has(p.id))
    else if (showSubscribedOnly && subscribedIds.size > 0)
      result = pins.filter((p) => subscribedIds.has(p.community_id))
    else result = pins

    if (!explicit && hiddenCommunityIds.size > 0) {
      result = result.filter((p) => !hiddenCommunityIds.has(p.community_id))
    }

    // Tag filter (only meaningful inside a selected community) — pin must carry
    // ALL selected tags
    if (selectedTagIds.size > 0) {
      result = result.filter((p) =>
        p.tag_ids ? Array.from(selectedTagIds).every((id) => p.tag_ids!.includes(id)) : false
      )
    }
    return result
  }, [pins, selectedCommunity, showSubscribedOnly, subscribedIds, showSavedOnly, savedPinIds, activeCollectionId, activeCollectionPinIds, hiddenCommunityIds, selectedTagIds])

  // ── Collection CRUD ────────────────────────────────────────────────────────
  const handleCreateCollection = useCallback(async (name: string): Promise<Collection | null> => {
    if (!user) return null
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single()
    if (error || !data) return null
    setCollections((prev) => [...prev, data as Collection])
    return data as Collection
  }, [user])

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    await supabase.from('collections').update({ name: name.trim() }).eq('id', id)
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)))
  }, [])

  const handleDeleteCollection = useCallback(async (id: string) => {
    await supabase.from('collections').delete().eq('id', id)
    setCollections((prev) => prev.filter((c) => c.id !== id))
    setActiveCollectionId((cur) => (cur === id ? null : cur))
  }, [])

  // ── Route CRUD + stop editing ──────────────────────────────────────────────
  const loadRouteStops = useCallback(async (routeId: string) => {
    const { data } = await supabase
      .from('route_pins')
      .select('position, pin:pins(*, community:communities(*), profile:profiles(username, avatar_url))')
      .eq('route_id', routeId)
      .order('position')
    const stops = (data ?? [])
      .map((r) => {
        const row = r as { position: number; pin: Pin | Pin[] }
        const pin = Array.isArray(row.pin) ? row.pin[0] : row.pin
        return pin ? { pin, position: row.position } : null
      })
      .filter((s): s is { pin: Pin; position: number } => !!s)
    setRouteStops(stops)
  }, [])

  const handleSelectRoute = (id: string) => {
    setSelectedCommunity(null)       // route panel takes the side slot
    setActiveRouteId(id)
    setRouteBuildMode(false)
    loadRouteStops(id)
  }

  const handleCloseRoute = () => {
    setActiveRouteId(null)
    setRouteStops([])
    setRouteBuildMode(false)
  }

  const handleCreateRoute = useCallback(async (name: string): Promise<Route | null> => {
    if (!user) return null
    const { data, error } = await supabase
      .from('routes')
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single()
    if (error || !data) return null
    setRoutes((prev) => [...prev, data as Route])
    return data as Route
  }, [user])

  const handleRenameRoute = useCallback(async (id: string, name: string) => {
    await supabase.from('routes').update({ name: name.trim() }).eq('id', id)
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, name: name.trim() } : r)))
  }, [])

  const handleDeleteRoute = useCallback(async (id: string) => {
    await supabase.from('routes').delete().eq('id', id)
    setRoutes((prev) => prev.filter((r) => r.id !== id))
    setActiveRouteId((cur) => {
      if (cur === id) { setRouteStops([]); setRouteBuildMode(false); return null }
      return cur
    })
  }, [])

  const handleAddPinToRoute = async (pin: Pin) => {
    if (!activeRouteId) return
    if (routeStops.some((s) => s.pin.id === pin.id)) return // no duplicates
    const nextPos = routeStops.length ? Math.max(...routeStops.map((s) => s.position)) + 1 : 0
    setRouteStops((prev) => [...prev, { pin, position: nextPos }])
    await supabase.from('route_pins').insert({ route_id: activeRouteId, pin_id: pin.id, position: nextPos })
  }

  const handleRemoveRouteStop = async (pinId: string) => {
    if (!activeRouteId) return
    setRouteStops((prev) => prev.filter((s) => s.pin.id !== pinId))
    await supabase.from('route_pins').delete().eq('route_id', activeRouteId).eq('pin_id', pinId)
  }

  const handleMoveRouteStop = async (index: number, dir: -1 | 1) => {
    if (!activeRouteId) return
    const j = index + dir
    if (j < 0 || j >= routeStops.length) return
    const a = routeStops[index], b = routeStops[j]
    // Swap positions in the DB and locally
    const reordered = [...routeStops]
    reordered[index] = b; reordered[j] = a
    const posA = a.position, posB = b.position
    reordered[j] = { ...a, position: posB }
    reordered[index] = { ...b, position: posA }
    setRouteStops(reordered.sort((x, y) => x.position - y.position))
    await Promise.all([
      supabase.from('route_pins').update({ position: posB }).eq('route_id', activeRouteId).eq('pin_id', a.pin.id),
      supabase.from('route_pins').update({ position: posA }).eq('route_id', activeRouteId).eq('pin_id', b.pin.id),
    ])
  }

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleMapClick = (lat: number, lng: number) => {
    if (routeBuildMode) return // building a route — only pin taps matter
    if (selectedPin) { setSelectedPin(null); return }
    setPendingLatLng([lat, lng])
  }

  const handlePinClick = (pin: Pin) => {
    // In route build mode, tapping a pin appends it to the active route instead
    // of opening its detail.
    if (routeBuildMode && activeRouteId) { handleAddPinToRoute(pin); return }
    setPendingLatLng(null)
    setSelectedPin(pin)
  }

  const handleAddPinForCommunity = (communityId: string) => {
    setPendingCommunityOverride(communityId)
    setPendingLatLng([mapCenter[0], mapCenter[1]])
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleToggleSubscription = async (communityId: string) => {
    if (!user) { setShowAuthModal(true); return }

    if (subscribedIds.has(communityId)) {
      await supabase
        .from('community_subscriptions')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', user.id)
      setSubscribedIds((prev) => {
        const next = new Set(prev)
        next.delete(communityId)
        return next
      })
      // If this was the last subscription and we were in subscribed-only mode,
      // fall back to all-communities view so the map doesn't look empty
      if (subscribedIds.size === 1 && showSubscribedOnly) {
        setShowSubscribedOnly(false)
        userChoseFilter.current = false // allow auto-default to re-activate on re-subscribe
      }
    } else {
      await supabase
        .from('community_subscriptions')
        .insert({ community_id: communityId, user_id: user.id })
      setSubscribedIds((prev) => new Set([...prev, communityId]))
    }
  }

  const handleAcceptInvite = async (memberId: string) => {
    if (!user) return
    await supabase
      .from('community_members')
      .update({ status: 'accepted' })
      .eq('id', memberId)
      .eq('user_id', user.id)
    setPendingInvites((prev) => prev.filter((i) => i.id !== memberId))
    fetchCommunities() // make the newly-joined private community appear
  }

  const handleDeclineInvite = async (memberId: string) => {
    if (!user) return
    await supabase
      .from('community_members')
      .delete()
      .eq('id', memberId)
      .eq('user_id', user.id)
    setPendingInvites((prev) => prev.filter((i) => i.id !== memberId))
  }

  const handleToggleFollow = async (targetUserId: string) => {
    if (!user) { setShowAuthModal(true); return }
    if (targetUserId === user.id) return // can't follow yourself

    if (followedUserIds.has(targetUserId)) {
      // Optimistic remove
      setFollowedUserIds((prev) => { const n = new Set(prev); n.delete(targetUserId); return n })
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('followee_id', targetUserId)
    } else {
      setFollowedUserIds((prev) => new Set([...prev, targetUserId]))
      await supabase
        .from('follows')
        .insert({ follower_id: user.id, followee_id: targetUserId })
    }
  }

  const handleToggleSave = async (pinId: string) => {
    if (!user) { setShowAuthModal(true); return }
    if (savedPinIds.has(pinId)) {
      setSavedPinIds((prev) => { const n = new Set(prev); n.delete(pinId); return n })
      await supabase.from('saved_pins').delete().eq('user_id', user.id).eq('pin_id', pinId)
    } else {
      setSavedPinIds((prev) => new Set([...prev, pinId]))
      await supabase.from('saved_pins').insert({ user_id: user.id, pin_id: pinId })
    }
  }

  // Following feed → fly to the pin and open its detail
  const handleSelectPin = (pin: Pin) => {
    handleFlyTo(pin.lat, pin.lng, 16)
    setSelectedPin(pin)
    setShowMobileSidebar(false)
  }

  const handleCenterChange = useCallback((lat: number, lng: number) => {
    setMapCenter([lat, lng])
  }, [])

  const handleFlyTo = (lat: number, lng: number, zoom: number) => {
    flyToCounter.current += 1
    setFlyToTarget({ lat, lng, zoom, id: flyToCounter.current })
  }

  const handleDeletePin = async (pinId: string) => {
    await supabase.from('pins').delete().eq('id', pinId)
    setPins((prev) => prev.filter((p) => p.id !== pinId))
    setSelectedPin(null)
  }

  // Reflect an edited pin (title/description/url) in both the list and the open modal
  const handleUpdatePin = (updated: Partial<Pin> & { id: string }) => {
    setPins((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
    setSelectedPin((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev))
  }

  // ── Community group CRUD ─────────────────────────────────────────────────

  const handleCreateGroup = useCallback(async (name: string): Promise<string | null> => {
    if (!user) return null
    const position = groups.length
    const { data, error } = await supabase
      .from('community_groups')
      .insert({ user_id: user.id, name: name.trim(), position })
      .select()
      .single()
    if (error || !data) return null
    setGroups((prev) => [...prev, data])
    return data.id
  }, [user, groups.length])

  const handleRenameGroup = useCallback(async (id: string, name: string) => {
    await supabase.from('community_groups').update({ name: name.trim() }).eq('id', id)
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)))
  }, [])

  const handleDeleteGroup = useCallback(async (id: string) => {
    await supabase.from('community_groups').delete().eq('id', id)
    setGroups((prev) => prev.filter((g) => g.id !== id))
    // Clear group assignment for any communities that were in this group
    setCommunityGroupMap((prev) => {
      const next = new Map(prev)
      for (const [cid, gid] of next) {
        if (gid === id) next.set(cid, null)
      }
      return next
    })
  }, [])

  const handleAssignGroup = useCallback(async (communityId: string, groupId: string | null) => {
    if (!user) return
    await supabase
      .from('community_subscriptions')
      .update({ group_id: groupId })
      .eq('community_id', communityId)
      .eq('user_id', user.id)
    setCommunityGroupMap((prev) => new Map(prev).set(communityId, groupId))
  }, [user])

  // ── Near Me ───────────────────────────────────────────────────────────────
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation not supported')
      setTimeout(() => setLocationError(null), 3000)
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        handleFlyTo(coords.latitude, coords.longitude, 14)
        setLocating(false)
      },
      (err) => {
        setLocationError(
          err.code === 1 ? 'Location access denied' :
          err.code === 2 ? 'Location unavailable' : 'Location timed out'
        )
        setLocating(false)
        setTimeout(() => setLocationError(null), 3000)
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  // Mobile FAB — opens the quick-add sheet (GPS + nearby place suggestions)
  const handleFabAddPin = () => setShowQuickAdd(true)

  // Quick-add → "More options": hand off to the full Add Pin modal, pre-filled
  const handleQuickAddMore = (lat: number, lng: number, title: string, communityId: string | null) => {
    setShowQuickAdd(false)
    setPendingCommunityOverride(communityId)
    setPendingPinTitle(title || null)
    setPendingLatLng([lat, lng])
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const settingsCommunity = communitySettingsId
    ? communities.find((c) => c.id === communitySettingsId) ?? null
    : null

  const selectedCommunityObj = selectedCommunity
    ? communities.find((c) => c.id === selectedCommunity) ?? null
    : null

  // ── Overlay bookkeeping ───────────────────────────────────────────────────
  // panelOpen  = the community side panel / bottom sheet (non-blocking on desktop)
  // modalOpen  = a blocking modal/sheet that should own the screen
  // When either is up, the floating map controls hide so nothing overlaps.
  const panelOpen = !!selectedCommunityObj || !!activeRouteId
  const modalOpen =
    !!pendingLatLng || !!selectedPin || showAuthModal || showSearch ||
    showCreateModal || !!communitySettingsId || showQuickAdd
  const overlayOpen = panelOpen || modalOpen

  // Active route → ordered polyline path for the map
  const activeRoute = activeRouteId ? routes.find((r) => r.id === activeRouteId) ?? null : null
  const routePath = routeStops.map((s) => [s.pin.lat, s.pin.lng] as [number, number])

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">
      <Sidebar
        communities={communities}
        pins={pins}
        selectedCommunity={selectedCommunity}
        showSubscribedOnly={showSubscribedOnly}
        showSavedOnly={showSavedOnly}
        savedCount={savedPinIds.size}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onSelectCollection={handleSelectCollection}
        onCreateCollection={handleCreateCollection}
        onRenameCollection={handleRenameCollection}
        onDeleteCollection={handleDeleteCollection}
        routes={routes}
        activeRouteId={activeRouteId}
        onSelectRoute={handleSelectRoute}
        onCreateRoute={handleCreateRoute}
        subscribedIds={subscribedIds}
        hiddenCommunityIds={hiddenCommunityIds}
        onToggleCommunityVisibility={handleToggleCommunityVisibility}
        ownedCommunityIds={ownedCommunityIds}
        modCommunityIds={modCommunityIds}
        onSelectCommunity={handleSelectCommunity}
        onShowSubscribed={handleShowSubscribed}
        onShowSaved={handleShowSaved}
        onToggleSubscription={handleToggleSubscription}
        onOpenSettings={setCommunitySettingsId}
        onAddPin={handleAddPinForCommunity}
        onOpenSearch={() => setShowSearch(true)}
        groups={groups}
        communityGroupMap={communityGroupMap}
        followedUserIds={followedUserIds}
        onSelectPin={handleSelectPin}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
        onAssignGroup={handleAssignGroup}
        pendingInvites={pendingInvites}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        mobileOpen={showMobileSidebar}
        onMobileClose={() => setShowMobileSidebar(false)}
        user={user}
        authReady={authReady}
        onSignIn={() => setShowAuthModal(true)}
        onSignOut={handleSignOut}
        onCreateCommunity={() => setShowCreateModal(true)}
        isAdmin={isAdmin}
      />

      <main className="relative flex-1 overflow-hidden">
        {/* Hamburger — mobile only; hidden whenever any overlay owns the screen */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className={`fixed left-4 top-4 z-[1100] flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors ${overlayOpen ? 'hidden' : 'md:hidden'}`}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile FAB — drop a pin at the current map centre.
            Hidden on md+ (desktop uses tap-the-map) and whenever an overlay is open. */}
        {!overlayOpen && (
          <button
            onClick={handleFabAddPin}
            aria-label="Drop a pin"
            className="fixed bottom-36 right-4 z-[1100] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl transition-transform active:scale-95 hover:bg-indigo-500 md:bottom-28 md:hidden"
          >
            <Plus className="h-7 w-7" />
          </button>
        )}

        {/* Location / geocoding search — top right of map.
            Unmounted while a blocking modal is open so it can't float over a sheet. */}
        {!modalOpen && (
          <LocationSearch
            onFlyTo={handleFlyTo}
            panelOpen={panelOpen}
            onAddPin={(lat, lng, name) => {
              setPendingLatLng([lat, lng])
              setPendingPinTitle(name)
            }}
          />
        )}

        {/* Near me — bottom-right of map; hidden when any overlay is open */}
        {!overlayOpen && (
          <div className="absolute right-4 bottom-20 z-[1100] flex flex-col items-end gap-2 md:bottom-8">
            {locationError && (
              <div className="rounded-lg border border-red-500/30 bg-gray-900 px-3 py-1.5 text-xs text-red-400 shadow-lg">
                {locationError}
              </div>
            )}
            <button
              onClick={handleNearMe}
              disabled={locating}
              title="Fly to my location"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-gray-300 shadow-lg transition-colors hover:border-indigo-500 hover:text-white disabled:opacity-50"
            >
              {locating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LocateFixed className="h-4 w-4" />}
            </button>
          </div>
        )}

        {/* Map style switcher — bottom-left of map; hidden when any overlay is open */}
        {!overlayOpen && (
          <div className="absolute left-4 bottom-20 z-[1100] md:bottom-8">
            <MapStyleSwitcher value={mapStyle} onChange={handleMapStyleChange} />
          </div>
        )}

        <MapWrapper
          pins={filteredPins}
          communities={communities}
          onMapClick={handleMapClick}
          onPinClick={handlePinClick}
          flyToTarget={flyToTarget}
          onCenterChange={handleCenterChange}
          followedUserIds={followedUserIds}
          mapStyle={mapStyle}
          routePath={routePath}
          routeColor={activeRoute?.color}
        />

        {/* Route build-mode banner */}
        {routeBuildMode && activeRoute && (
          <div className="absolute left-1/2 top-4 z-[1100] -translate-x-1/2 rounded-full border border-indigo-500/40 bg-gray-900/95 px-4 py-2 text-xs font-medium text-indigo-200 shadow-lg backdrop-blur-sm">
            Tap pins to add to <span className="font-semibold text-white">{activeRoute.name}</span>
          </div>
        )}

        {activeRoute && (
          <RoutePanel
            route={activeRoute}
            stops={routeStops}
            buildMode={routeBuildMode}
            onToggleBuild={() => setRouteBuildMode((v) => !v)}
            onClose={handleCloseRoute}
            onSelectPin={(pin) => { handleFlyTo(pin.lat, pin.lng, 16); setSelectedPin(pin) }}
            onRemoveStop={handleRemoveRouteStop}
            onMoveStop={handleMoveRouteStop}
            onDelete={handleDeleteRoute}
          />
        )}

        {selectedCommunityObj && !activeRoute && (
          <CommunityPinsPanel
            community={selectedCommunityObj}
            pins={filteredPins}
            selectedTagIds={selectedTagIds}
            onToggleTag={toggleTagFilter}
            onClose={() => handleSelectCommunity(null)}
            onPinClick={handlePinClick}
            onAddPin={handleAddPinForCommunity}
          />
        )}

        {showCreateModal && user && (
          <CreateCommunityModal
            userId={user.id}
            onClose={() => setShowCreateModal(false)}
            onSuccess={(newId) => {
              setShowCreateModal(false)
              fetchCommunities()
              // If a pin is mid-drop, select the new community in that form
              // (don't disturb the map behind it); otherwise jump the map to it.
              if (pendingLatLng) setPendingCommunityOverride(newId)
              else handleSelectCommunity(newId)
            }}
          />
        )}

        {showAuthModal && !user && (
          <AuthModal
            onClose={() => {
              setShowAuthModal(false)
              setPendingLatLng(null)
            }}
            onSuccess={() => setShowAuthModal(false)}
          />
        )}

        {pendingLatLng && !showAuthModal && (
          <AddPinModal
            lat={pendingLatLng[0]}
            lng={pendingLatLng[1]}
            communities={communities}
            initialCommunityId={pendingCommunityOverride ?? selectedCommunity}
            initialTitle={pendingPinTitle ?? undefined}
            userId={user?.id ?? null}
            subscribedIds={subscribedIds}
            moderatedIds={moderatedIds}
            onClose={() => { setPendingLatLng(null); setPendingCommunityOverride(null); setPendingPinTitle(null) }}
            onSuccess={() => { setPendingLatLng(null); setPendingCommunityOverride(null); setPendingPinTitle(null); fetchPins() }}
            onSignIn={() => { setShowAuthModal(true) }}
            onCreateCommunity={() => setShowCreateModal(true)}
            selectCommunityId={pendingCommunityOverride}
          />
        )}

        {showQuickAdd && !showAuthModal && (
          <QuickAddSheet
            communities={communities}
            userId={user?.id ?? null}
            subscribedIds={subscribedIds}
            moderatedIds={moderatedIds}
            preferredCommunityId={selectedCommunity}
            onClose={() => setShowQuickAdd(false)}
            onSuccess={() => { setShowQuickAdd(false); fetchPins() }}
            onSignIn={() => setShowAuthModal(true)}
            onMoreOptions={handleQuickAddMore}
          />
        )}

        {selectedPin && (
          <PinDetailModal
            pin={selectedPin}
            user={user}
            canDelete={
              !!user && (
                user.id === selectedPin.user_id ||
                canModerate(selectedPin.community_id)
              )
            }
            isModerator={!!user && canModerate(selectedPin.community_id)}
            onClose={() => setSelectedPin(null)}
            onVoteUpdate={(updated) => {
              setPins((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
              setSelectedPin((prev) => (prev ? { ...prev, ...updated } : null))
            }}
            onDeletePin={handleDeletePin}
            onUpdatePin={handleUpdatePin}
            onSignIn={() => setShowAuthModal(true)}
            onGoToPin={() => {
              handleFlyTo(selectedPin.lat, selectedPin.lng, 17)
            }}
            followedUserIds={followedUserIds}
            onToggleFollow={handleToggleFollow}
            isSaved={savedPinIds.has(selectedPin.id)}
            onToggleSave={handleToggleSave}
            collections={collections}
            onCreateCollection={handleCreateCollection}
          />
        )}

        {showSearch && (
          <SearchModal
            communities={communities}
            onSelectCommunity={(id) => { handleSelectCommunity(id); setShowSearch(false) }}
            onSelectPin={(pin) => { setSelectedPin(pin); setShowSearch(false) }}
            onClose={() => setShowSearch(false)}
          />
        )}

        {settingsCommunity && user && (
          <CommunitySettingsModal
            community={settingsCommunity}
            currentUserId={user.id}
            isOwner={settingsCommunity.created_by === user.id}
            isAdmin={isAdmin}
            onClose={() => setCommunitySettingsId(null)}
            onSettingsUpdate={(updated) => {
              setCommunities((prev) =>
                prev.map((c) => (c.id === settingsCommunity.id ? { ...c, ...updated } : c))
              )
            }}
            onDelete={() => {
              setCommunities((prev) => prev.filter((c) => c.id !== settingsCommunity.id))
              if (selectedCommunity === settingsCommunity.id) setSelectedCommunity(null)
              setCommunitySettingsId(null)
            }}
          />
        )}

        {/* Persistent bottom nav — mobile only; hidden while an overlay owns the screen */}
        {!overlayOpen && (
          <BottomNav
            username={myUsername}
            onMap={() => { setSelectedPin(null); handleSelectCommunity(null); setShowMobileSidebar(false) }}
            onFeed={() => { setSidebarTab('feed'); setShowMobileSidebar(true) }}
            onSignIn={() => setShowAuthModal(true)}
          />
        )}
      </main>
    </div>
  )
}
