'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Menu } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ADMIN_USER_ID } from '@/lib/constants'
import { Community, Pin, PendingInvite } from '@/lib/types'
import type { FlyToTarget } from '@/components/MapInner'
import Sidebar from '@/components/Sidebar'
import MapWrapper from '@/components/MapWrapper'
import LocationSearch from '@/components/LocationSearch'
import AddPinModal from '@/components/AddPinModal'
import PinDetailModal from '@/components/PinDetailModal'
import AuthModal from '@/components/AuthModal'
import CreateCommunityModal from '@/components/CreateCommunityModal'
import CommunitySettingsModal from '@/components/CommunitySettingsModal'
import SearchModal from '@/components/SearchModal'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [communitySettingsId, setCommunitySettingsId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null)
  const flyToCounter = useRef(0)
  // Tracks whether user has manually chosen a filter; prevents auto-default from overriding choices
  const userChoseFilter = useRef(false)

  const [communities, setCommunities] = useState<Community[]>([])
  const [pins, setPins] = useState<Pin[]>([])
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null)
  const [showSubscribedOnly, setShowSubscribedOnly] = useState(false)
  const [pendingLatLng, setPendingLatLng] = useState<[number, number] | null>(null)
  const [pendingCommunityOverride, setPendingCommunityOverride] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([30, 10]) // matches MapInner initial center
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null)

  // Moderation, subscriptions & invites
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())
  const [modCommunityIds, setModCommunityIds] = useState<Set<string>>(new Set())
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])

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
    if (!user) { setSubscribedIds(new Set()); return }
    const { data } = await supabase
      .from('community_subscriptions')
      .select('community_id')
      .eq('user_id', user.id)
    if (data) setSubscribedIds(new Set(data.map((s) => s.community_id)))
  }, [user])

  const fetchModRoles = useCallback(async () => {
    if (!user) { setModCommunityIds(new Set()); return }
    const { data } = await supabase
      .from('community_moderators')
      .select('community_id')
      .eq('user_id', user.id)
    if (data) setModCommunityIds(new Set(data.map((m) => m.community_id)))
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

  useEffect(() => { fetchSubscriptions() }, [fetchSubscriptions])
  useEffect(() => { fetchModRoles() }, [fetchModRoles])
  useEffect(() => { fetchPendingInvites() }, [fetchPendingInvites])

  // Reset manual-filter flag when auth changes, and clear subscribed view on sign-out
  useEffect(() => {
    userChoseFilter.current = false
    if (!user) { setShowSubscribedOnly(false); setSelectedCommunity(null) }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-default logged-in users with subscriptions to the subscribed-only view
  useEffect(() => {
    if (userChoseFilter.current) return
    if (user && subscribedIds.size > 0) {
      setShowSubscribedOnly(true)
      setSelectedCommunity(null)
    }
  }, [user, subscribedIds]) // eslint-disable-line react-hooks/exhaustive-deps

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
      .select('*, community:communities(*), profile:profiles(username, avatar_url)')
      .eq('status', 'approved')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
    if (data) setPins(data)
  }, [])

  useEffect(() => { fetchPins() }, [fetchPins])

  useEffect(() => {
    const channel = supabase
      .channel('pins-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, () => fetchPins())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPins])

  // ── Interaction handlers ──────────────────────────────────────────────────

  const handleSelectCommunity = (id: string | null) => {
    userChoseFilter.current = true
    setSelectedCommunity(id)
    setShowSubscribedOnly(false)
  }

  const handleShowSubscribed = () => {
    userChoseFilter.current = true
    setSelectedCommunity(null)
    setShowSubscribedOnly(true)
  }

  const filteredPins = useMemo(() => {
    if (selectedCommunity) return pins.filter((p) => p.community_id === selectedCommunity)
    if (showSubscribedOnly && subscribedIds.size > 0)
      return pins.filter((p) => subscribedIds.has(p.community_id))
    return pins
  }, [pins, selectedCommunity, showSubscribedOnly, subscribedIds])

  const handleMapClick = (lat: number, lng: number) => {
    if (selectedPin) { setSelectedPin(null); return }

    if (!user) {
      setPendingLatLng([lat, lng])
      setShowAuthModal(true)
      return
    }

    setPendingLatLng([lat, lng])
  }

  const handlePinClick = (pin: Pin) => {
    setPendingLatLng(null)
    setSelectedPin(pin)
  }

  const handleAddPinForCommunity = (communityId: string) => {
    // Set state before auth check so it survives the sign-in flow
    setPendingCommunityOverride(communityId)
    setPendingLatLng([mapCenter[0], mapCenter[1]])
    if (!user) { setShowAuthModal(true); return }
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

  // ── Render ────────────────────────────────────────────────────────────────
  const settingsCommunity = communitySettingsId
    ? communities.find((c) => c.id === communitySettingsId) ?? null
    : null

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">
      <Sidebar
        communities={communities}
        pins={pins}
        selectedCommunity={selectedCommunity}
        showSubscribedOnly={showSubscribedOnly}
        subscribedIds={subscribedIds}
        ownedCommunityIds={ownedCommunityIds}
        modCommunityIds={modCommunityIds}
        onSelectCommunity={handleSelectCommunity}
        onShowSubscribed={handleShowSubscribed}
        onToggleSubscription={handleToggleSubscription}
        onOpenSettings={(id) => setCommunitySettingsId(id)}
        onAddPin={handleAddPinForCommunity}
        onOpenSearch={() => setShowSearch(true)}
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
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="fixed left-4 top-4 z-[1001] flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Location / geocoding search — top right of map */}
        <LocationSearch onFlyTo={handleFlyTo} />

        <MapWrapper
          pins={filteredPins}
          communities={communities}
          onMapClick={handleMapClick}
          onPinClick={handlePinClick}
          flyToTarget={flyToTarget}
          onCenterChange={handleCenterChange}
        />

        {showCreateModal && user && (
          <CreateCommunityModal
            userId={user.id}
            onClose={() => setShowCreateModal(false)}
            onSuccess={(newId) => {
              setShowCreateModal(false)
              fetchCommunities()
              handleSelectCommunity(newId)
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

        {pendingLatLng && user && !showAuthModal && (
          <AddPinModal
            lat={pendingLatLng[0]}
            lng={pendingLatLng[1]}
            communities={communities}
            initialCommunityId={pendingCommunityOverride ?? selectedCommunity}
            userId={user.id}
            subscribedIds={subscribedIds}
            moderatedIds={moderatedIds}
            onClose={() => { setPendingLatLng(null); setPendingCommunityOverride(null) }}
            onSuccess={() => { setPendingLatLng(null); setPendingCommunityOverride(null); fetchPins() }}
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
            onSignIn={() => setShowAuthModal(true)}
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
      </main>
    </div>
  )
}
