'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

const cardStyle = {
  position: 'relative',
  width: '100%',
  padding: '28px',
  background: 'linear-gradient(160deg, rgba(15, 33, 53, 0.9) 0%, rgba(11, 25, 41, 0.84) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '16px',
  cursor: 'pointer',
  textAlign: 'left',
  overflow: 'hidden',
  fontFamily: 'inherit',
  color: '#fff',
}

const accentBar = (accent) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '2.55px',
  background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.95) 22%, rgba(255, 255, 255, 0.7) 50%, rgba(${accent}, 0.95) 78%, transparent 100%)`,
  boxShadow: `0 0 15px rgba(${accent}, 0.5), 0 2px 8px rgba(${accent}, 0.32)`,
  pointerEvents: 'none',
})

const iconBox = (accent) => ({
  width: '52px',
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  marginBottom: '22px',
  fontSize: '28px',
  lineHeight: 1,
  background: `linear-gradient(145deg, rgba(${accent}, 0.22) 0%, rgba(${accent}, 0.08) 100%)`,
  border: `1px solid rgba(${accent}, 0.28)`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 18px rgba(${accent}, 0.18)`,
})

const cardTitle = { fontWeight: '700', fontSize: '16px', color: '#F0EDE8', marginBottom: '10px', lineHeight: 1.35 }
const cardDesc = { fontSize: '13px', color: '#7a92a8', lineHeight: 1.6, margin: 0 }

const pageBackground = {
  minHeight: '100vh',
  color: '#fff',
  fontFamily: 'sans-serif',
  backgroundColor: '#0b0d12',
  backgroundImage: `
    radial-gradient(ellipse 78% 58% at 50% 44%, rgba(90, 106, 126, 0.09) 0%, transparent 70%),
    radial-gradient(ellipse 95% 72% at 50% 108%, rgba(58, 70, 86, 0.055) 0%, transparent 52%),
    linear-gradient(180deg, rgba(74, 90, 110, 0.035) 0%, transparent 38%, rgba(74, 90, 110, 0.025) 100%),
    linear-gradient(172deg, #0b0d12 0%, #0d1016 38%, #0f1219 68%, #11151c 100%)
  `,
}

const DASHBOARD_CARDS = [
  { path: 'site-survey', icon: '📐', title: 'Site Survey Report', description: 'Voice-led site observations, measurements, photos and condition notes.', accent: '59,130,246' },
  { path: 'diary', icon: '📋', title: 'Site Diary Report', description: 'Voice-led daily progress, labour, plant, visitors, delays and issues.', accent: '255,140,66' },
  { path: 'weekly-report', icon: '📊', title: 'Site Progress Report', description: 'Voice-led weekly progress, risks, delays, photos and next-week priorities.', accent: '34,197,94' },
  { path: 'snags', icon: '⚠️', title: 'Site Snag List', description: 'Voice-led defect capture, photos, actions and close-out tracking.', accent: '255, 210, 72' },
  { path: 'weekly-hs', icon: '🦺', title: 'Site H&S Report', description: 'Voice-led hazards, inspections, toolbox talks, incidents and compliance checks.', accent: '255,59,48' },
]

export default function ProjectPage() {
  const [project, setProject] = useState(null)
  const [diaries, setDiaries] = useState([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()

  useEffect(() => {
    const load = async () => {
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
      const { data: logs } = await supabase.from('diary_entries').select('*').eq('project_id', id).order('entry_date', { ascending: false })
      setProject(proj)
      setDiaries(logs || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="dashboard-premium-bg" style={{ ...pageBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

  const mainCards = DASHBOARD_CARDS.slice(0, 4)
  const hsCard = DASHBOARD_CARDS[4]

  const renderCard = (card, index, wrapClassName = 'premium-dash-card-wrap', wrapStyle = {}) => (
    <div
      key={card.path}
      className={wrapClassName}
      style={{ animationDelay: `${index * 70}ms`, ...wrapStyle }}
    >
      <button
        className="premium-dash-card"
        onClick={() => router.push(`/dashboard/project/${project.id}/${card.path}`)}
        style={{ ...cardStyle, '--accent': card.accent }}
      >
        <div className="premium-dash-accent" style={accentBar(card.accent)} />
        <div className="premium-dash-icon" style={iconBox(card.accent)}>{card.icon}</div>
        <div style={{ ...cardTitle, ...(card.path === 'diary' || card.path === 'snags' ? { color: '#fff' } : {}) }}>{card.title}</div>
        <div style={{ ...cardDesc, ...(card.path === 'diary' || card.path === 'snags' ? { color: '#8ea2b5' } : {}) }}>{card.description}</div>
      </button>
    </div>
  )

  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{`
        .dashboard-premium-bg {
          position: relative;
        }
        .dashboard-premium-bg::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 128px 128px;
        }
        .dashboard-premium-bg > * {
          position: relative;
          z-index: 1;
        }
        .premium-dash-card-wrap {
          opacity: 0;
          animation: dash-card-enter 400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes dash-card-enter {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .premium-dash-card {
          transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
          border: 1px solid rgba(255, 255, 255, 0.13);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .premium-dash-accent,
        .premium-dash-icon {
          transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-dash-card-wrap:hover .premium-dash-card {
          transform: translateY(-6px) scale(1.015);
          filter: brightness(1.06);
          border-color: rgba(var(--accent), 0.48);
          box-shadow:
            0 24px 64px rgba(0, 0, 0, 0.54),
            0 0 52px rgba(var(--accent), 0.32),
            0 0 2px rgba(var(--accent), 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.14);
        }
        .premium-dash-card-wrap:hover .premium-dash-accent {
          filter: brightness(1.2);
        }
        .premium-dash-card-wrap:hover .premium-dash-icon {
          filter: brightness(1.15);
        }
        .premium-dash-card-wrap .premium-dash-card:active {
          transform: scale(0.985);
          transition-duration: 120ms;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .premium-dash-card-wrap:hover .premium-dash-card:active {
          transform: translateY(-6px) scale(0.985);
          filter: brightness(1.04);
          border-color: rgba(var(--accent), 0.38);
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.48),
            0 0 32px rgba(var(--accent), 0.2),
            0 0 1px rgba(var(--accent), 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          transition-duration: 120ms;
        }
        .premium-dash-card-wrap:hover .premium-dash-card:active .premium-dash-accent {
          filter: brightness(1.1);
          transition-duration: 120ms;
        }
        .premium-dash-card-wrap:hover .premium-dash-card:active .premium-dash-icon {
          filter: brightness(1.08);
          transition-duration: 120ms;
        }
        .premium-dash-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .premium-dash-cards-grid > .premium-dash-card-wrap,
        .premium-dash-card-wrap--solo {
          display: flex;
        }
        .premium-dash-cards-grid > .premium-dash-card-wrap > .premium-dash-card,
        .premium-dash-card-wrap--solo > .premium-dash-card {
          flex: 1;
          width: 100%;
          min-height: 188px;
        }
      `}</style>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700' }}>{project?.name}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{project?.client_name} · {project?.address}</div>
        </div>
      </div>

      <div style={{ padding: '20px 24px 24px', maxWidth: '600px', margin: '0 auto' }}>
        <div className="premium-dash-cards-grid" style={{ marginBottom: '16px' }}>
          {mainCards.map((card, index) => renderCard(card, index))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
          {renderCard(hsCard, 4, 'premium-dash-card-wrap premium-dash-card-wrap--solo', { width: 'calc(50% - 10px)' })}
        </div>

        <h2 style={{ fontSize: '16px', fontWeight: '600', marginTop: '48px', marginBottom: '16px', color: '#888' }}>RECENT DIARY ENTRIES</h2>

        {diaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#555' }}>
            <p>No entries yet</p>
            <p style={{ fontSize: '13px' }}>Tap Site Diary Report to add your first entry</p>
          </div>
        ) : (
          diaries.map(d => (
            <div key={d.id} style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ fontWeight: '600' }}>{d.entry_date}</div>
              <div style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>{d.notes?.slice(0, 100)}...</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}