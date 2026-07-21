import { createContext, type ReactNode, use, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { fetchMyAccessProfile } from '@/features/auth/authService'
import { hasPermission as checkPermission, isAdmin as checkIsAdmin } from '@/features/auth/permissions'
import type { AccessProfile, PermissionKey, RoleSlug } from '@/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  accessProfile: AccessProfile | null
  isLoading: boolean
  roles: RoleSlug[]
  permissions: PermissionKey[]
  isAdmin: boolean
  hasPermission: (key: PermissionKey) => boolean
  refreshAccessProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [accessProfile, setAccessProfile] = useState<AccessProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadAccessProfile(userId: string) {
    const profile = await fetchMyAccessProfile(userId)
    setAccessProfile(profile)
  }

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      if (data.session?.user) await loadAccessProfile(data.session.user.id)
      if (isMounted) setIsLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return
      setSession(newSession)
      if (newSession?.user) {
        await loadAccessProfile(newSession.user.id)
      } else {
        setAccessProfile(null)
      }
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const roles = accessProfile?.roles ?? []
  const permissions = accessProfile?.permissions ?? []

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    accessProfile,
    isLoading,
    roles,
    permissions,
    isAdmin: checkIsAdmin(roles),
    hasPermission: (key) => checkPermission(permissions, key),
    refreshAccessProfile: async () => {
      if (session?.user) await loadAccessProfile(session.user.id)
    },
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return context
}
