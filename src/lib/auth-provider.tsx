"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { subscribeToAuth, signInWithGoogle, logOutUser } from "@/lib/firebase"
import { useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"

interface AuthContextType {
  user: any | null
  loading: boolean
  accessToken: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("google_access_token") : null
    if (storedToken) setAccessToken(storedToken)

    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
      
      if (!firebaseUser && pathname !== "/login") {
        router.push("/login")
      } else if (firebaseUser && pathname === "/login") {
        router.push("/")
      }
    })

    return () => unsubscribe()
  }, [pathname, router])

  const signIn = async () => {
    try {
      setLoading(true)
      const { user, token } = await signInWithGoogle()
      setUser(user)
      if (token) {
        setAccessToken(token)
        localStorage.setItem("google_access_token", token)
      }
      toast("SYSTEM", { description: "Authorization Successful." })
      router.push("/")
    } catch (error) {
      console.error(error)
      toast("ERROR", { description: "Authentication failed. Check API config." })
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await logOutUser()
    localStorage.removeItem("google_access_token")
    setAccessToken(null)
    setUser(null)
    toast("SYSTEM", { description: "User disconnected." })
    router.push("/login")
  }

  return (
    <AuthContext.Provider value={{ user, loading, accessToken, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
