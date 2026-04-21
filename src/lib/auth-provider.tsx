"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { subscribeToAuth, signInWithGoogle, logOutUser, auth } from "@/lib/firebase"
import { useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"

interface AuthContextType {
  user: any | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
      if (!firebaseUser && pathname !== "/login") router.push("/login")
      else if (firebaseUser && pathname === "/login") router.push("/")
    })
    return () => unsubscribe()
  }, [pathname, router])

  const signIn = async () => {
    try {
      setLoading(true)
      const { user } = await signInWithGoogle()
      setUser(user)
      toast("SYSTEM", { description: "Signed in." })
      router.push("/")
    } catch (error) {
      console.error(error)
      toast("ERROR", { description: "Sign-in failed." })
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await logOutUser()
    setUser(null)
    router.push("/login")
  }

  const getIdToken = async () => {
    const current = auth?.currentUser
    return current ? current.getIdToken() : null
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getIdToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
