"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function MainNav() {
  const pathname = usePathname()

  if (pathname === "/login") return null

  const links = [
    { href: "/", label: "Hub" },
    { href: "/calendar", label: "Calendar" },
    { href: "/planner", label: "Planner" },
    { href: "/inbox", label: "Inbox" },
    { href: "/life", label: "Life" },
    { href: "/activity", label: "Activity" },
    { href: "/settings", label: "Settings" }
  ]

  return (
    <header className="border-b border-black/10 shrink-0">
      <div className="mx-auto max-w-[1600px] px-12 lg:px-24 h-24 flex items-center justify-between">
        <div className="font-heading text-2xl tracking-tighter font-medium">THE HUB</div>
        <nav className="flex items-center gap-12">
          {links.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs uppercase tracking-[0.2em] transition-colors ${
                  isActive ? "text-black font-medium border-b border-black pb-1" : "text-black/40 hover:text-black/80 pb-1"
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
