import { Link, useLocation } from 'react-router-dom'

// Free:    Chat | Tentang Kamu | Refleksi | Profile        (4 tab)
// Premium: Chat | Tentang Kamu | Refleksi | Rekomendasi | Profile (5 tab)
export default function BottomNav({ isPremium = false }) {
  const location = useLocation()

  const freeTabs = [
    { href: '/chat',         icon: '💬', label: 'Curhat'      },
    { href: '/tentang-kamu', icon: '💭', label: 'Tentang Kamu' },
    { href: '/refleksi',     icon: '📔', label: 'Refleksi'    },
    { href: '/profile',      icon: '👤', label: 'Profil'      },
  ]

  const premiumTabs = [
    { href: '/chat',          icon: '💬', label: 'Curhat'      },
    { href: '/tentang-kamu',  icon: '💭', label: 'Tentang Kamu' },
    { href: '/refleksi',      icon: '📔', label: 'Refleksi'    },
    { href: '/opportunities', icon: '🌿', label: 'Rekomendasi' },
    { href: '/profile',       icon: '👤', label: 'Profil'      },
  ]

  const tabs = isPremium ? premiumTabs : freeTabs

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: 'rgba(20,16,27,0.97)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(139,92,246,0.14)',
      display: 'flex', zIndex: 50,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(tab => {
        const active = location.pathname === tab.href
        return (
          <Link
            key={tab.href}
            to={tab.href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '10px 0 8px', textDecoration: 'none',
              position: 'relative',
            }}
          >
            <span style={{
              fontSize: '1.15rem', lineHeight: 1,
              filter: active ? 'none' : 'grayscale(30%)',
              transition: 'transform 0.2s ease',
              transform: active ? 'scale(1.12)' : 'scale(1)',
            }}>{tab.icon}</span>
            <span style={{
              fontSize: '0.58rem', marginTop: 4, fontWeight: active ? 700 : 400,
              color: active ? '#C4B5FD' : 'rgba(255,255,255,0.35)',
              letterSpacing: active ? '0.3px' : '0',
              transition: 'color 0.2s ease',
            }}>
              {tab.label}
            </span>
            {active && (
              <span style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 28, height: 2, background: 'linear-gradient(90deg,#8B5CF6,#FB7185)',
                borderRadius: '0 0 3px 3px',
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
