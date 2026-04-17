"use client"

import { useState } from "react"
import { useHub, EntityProfile } from "@/lib/store"
import { FileText, Plus, ShieldAlert } from "lucide-react"

export default function LifePage() {
  const { profiles } = useHub()
  const [activeProfileId, setActiveProfileId] = useState(profiles[0]?.id)
  
  const activeProfile = profiles.find(p => p.id === activeProfileId)

  return (
    <main className="flex-1 w-full bg-white text-foreground flex flex-col p-12 lg:p-24 overflow-hidden h-[calc(100vh-6rem)]">
      <div className="mx-auto max-w-[1600px] w-full h-full flex flex-col">

        <div className="flex justify-between items-end mb-12 shrink-0">
          <div>
            <h1 className="font-heading text-6xl font-light tracking-tighter text-foreground mb-2">Life Graph</h1>
            <p className="text-muted-foreground text-sm uppercase tracking-widest font-mono">Entity Profiles & Asset Memory</p>
          </div>
          <button className="border border-foreground px-6 py-2 text-xs uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">
            + Add Entity
          </button>
        </div>

        <div className="flex flex-1 min-h-0 gap-16">
          {/* Sidebar Navigation */}
          <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto">
             {profiles.map(profile => (
               <button
                 key={profile.id}
                 onClick={() => setActiveProfileId(profile.id)}
                 className={`text-left px-6 py-4 transition-colors flex justify-between items-center group ${activeProfileId === profile.id ? "bg-foreground text-background" : "hover:bg-muted text-foreground"}`}
               >
                 <span className="font-medium tracking-tight text-xl">{profile.name}</span>
                 <span className={`text-[10px] uppercase font-bold tracking-widest ${activeProfileId === profile.id ? "text-background/60" : "text-foreground/40 group-hover:text-muted-foreground"}`}>
                   {profile.type}
                 </span>
               </button>
             ))}
          </div>

          {/* Core Profile Area */}
          {activeProfile && (
            <div className="flex-1 flex flex-col border-l border-border pl-16 overflow-y-auto pr-8">

              <div className="mb-12">
                <h2 className="font-heading text-5xl font-light tracking-tighter mb-6">{activeProfile.name}</h2>
                <div className="bg-muted p-6 border-l-2 border-foreground">
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-3">Current Context</h3>
                  <p className="text-foreground/80 font-serif italic text-lg leading-relaxed">{activeProfile.currentContext}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 mb-12">
                {/* Preferences */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-6 flex justify-between border-b border-border pb-2">
                    <span>Preferences & Interests</span>
                    <Plus className="w-4 h-4 cursor-pointer hover:text-foreground" />
                  </h3>
                  {activeProfile.preferences.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                       {activeProfile.preferences.map(pref => (
                         <span key={pref} className="border border-border px-3 py-1 text-sm">{pref}</span>
                       ))}
                    </div>
                  ) : <p className="text-sm text-foreground/40 italic font-serif">No persistent preferences logged.</p>}
                </div>

                {/* Routines */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-6 flex justify-between border-b border-border pb-2">
                    <span>Known Routines</span>
                    <Plus className="w-4 h-4 cursor-pointer hover:text-foreground" />
                  </h3>
                  {activeProfile.routines.length > 0 ? (
                    <ul className="space-y-3">
                       {activeProfile.routines.map(routine => (
                         <li key={routine} className="flex items-center gap-4 text-sm">
                           <span className="w-1.5 h-1.5 bg-foreground shrink-0" />
                           <span className="text-foreground">{routine}</span>
                         </li>
                       ))}
                    </ul>
                  ) : <p className="text-sm text-foreground/40 italic font-serif">No recurring routines active.</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 mb-12">
                {/* Logistics */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-6 border-b border-border pb-2">Logistics & Sizes</h3>
                  {Object.keys(activeProfile.sizes).length > 0 ? (
                    <div className="grid grid-cols-2 gap-y-4">
                       {Object.entries(activeProfile.sizes).map(([key, value]) => (
                         <div key={key}>
                           <span className="block text-xs uppercase text-foreground/40">{key}</span>
                           <span className="text-foreground font-medium">{value}</span>
                         </div>
                       ))}
                    </div>
                  ) : <p className="text-sm text-foreground/40 italic font-serif">No logistical sizes currently requested.</p>}

                  {activeProfile.medicalNotes && (
                    <div className="mt-8 bg-red-50 text-red-900 border border-red-200 p-4 flex gap-4 items-start">
                      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="block text-xs uppercase tracking-widest font-bold mb-1">Medical Flag</span>
                        <span className="text-sm font-serif">{activeProfile.medicalNotes}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Asset Manager */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-6 flex justify-between border-b border-border pb-2">
                    <span>Asset Manager</span>
                    <Plus className="w-4 h-4 cursor-pointer hover:text-foreground" />
                  </h3>
                  <div className="space-y-3">
                    {/* Mock Assets */}
                    <div className="flex items-center gap-4 group cursor-pointer">
                       <div className="w-8 h-8 bg-muted flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                         <FileText className="w-4 h-4" />
                       </div>
                       <div>
                         <span className="block text-sm font-medium text-foreground group-hover:underline">Identity / Passport.pdf</span>
                         <span className="text-[10px] uppercase font-mono tracking-widest text-foreground/40">Secured • Drive</span>
                       </div>
                    </div>
                    {activeProfile.type === "Child" && (
                      <div className="flex items-center gap-4 group cursor-pointer">
                         <div className="w-8 h-8 bg-muted flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                           <FileText className="w-4 h-4" />
                         </div>
                         <div>
                           <span className="block text-sm font-medium text-foreground group-hover:underline">School Physical 2026.pdf</span>
                           <span className="text-[10px] uppercase font-mono tracking-widest text-foreground/40">Secured • Uploaded 2w ago</span>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </main>
  )
}
