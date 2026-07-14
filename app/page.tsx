import Image from 'next/image'
import Link from 'next/link'
import { Space_Grotesk, Barlow } from 'next/font/google'
import { LandingFeatureStrip, LandingMicIcon } from './landing-feature-strip'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ink)',
        color: 'var(--text)',
      }}
    >
      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '420px',
          margin: '0 auto',
          padding: '105px 24px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '10px',
            width: '100%',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: '100%',
              aspectRatio: '1',
              maxWidth: '100%',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--rust), transparent 88%) 0%, color-mix(in srgb, var(--rust), transparent 96%) 40%, transparent 68%)',
              pointerEvents: 'none',
            }}
          />
          <Image
            src="/riveted-z.png"
            alt=""
            width={420}
            height={420}
            priority
            style={{
              position: 'relative',
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        </div>

        <h1
          style={{
            margin: '0 0 10px',
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '104px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            lineHeight: 1,
          }}
        >
          Zlog
        </h1>

        <p
          style={{
            margin: '0 0 14px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '17px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--text)',
            lineHeight: 1.5,
          }}
        >
          See it{' '}
          <span style={{ color: 'color-mix(in srgb, var(--rust), var(--ink) 10%)' }}>|</span>{' '}
          Say it{' '}
          <span style={{ color: 'color-mix(in srgb, var(--rust), var(--ink) 10%)' }}>|</span>{' '}
          <span style={{ color: 'var(--rust)' }}>Logged.</span>
        </p>

        <h2
          style={{
            margin: '0 0 24px',
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '25px',
            fontWeight: 600,
            lineHeight: 1.28,
            color: 'var(--text)',
            maxWidth: '320px',
          }}
        >
          Built for the people who run the site.
        </h2>

        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <Link
            href="/signup"
            style={{
              position: 'relative',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              width: '100%',
              minHeight: '53px',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid color-mix(in srgb, var(--rust), var(--ink) 58%)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--rust), var(--text) 16%) 0%, color-mix(in srgb, var(--rust), var(--text) 6%) 18%, var(--rust) 42%, var(--rust) 62%, color-mix(in srgb, var(--rust), var(--ink) 29%) 88%, color-mix(in srgb, var(--rust), var(--ink) 45%) 100%)',
              boxShadow:
                'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%), inset 0 16px 28px color-mix(in srgb, var(--text), transparent 94%), inset 0 -14px 20px color-mix(in srgb, var(--ink), transparent 48%), 0 0 22px color-mix(in srgb, var(--rust), transparent 75%)',
              color: 'var(--text)',
              fontFamily: barlow.style.fontFamily,
              fontSize: '16px',
              fontWeight: 600,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: '46%',
                pointerEvents: 'none',
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--text), transparent 90%) 0%, color-mix(in srgb, var(--text), transparent 97%) 55%, transparent 100%)',
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                opacity: 0.12,
                mixBlendMode: 'soft-light',
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                backgroundSize: '160px 160px',
              }}
            />
            <span style={{ position: 'relative', zIndex: 1, justifySelf: 'start', display: 'inline-flex', color: 'var(--text)', paddingLeft: 10 }}>
              <LandingMicIcon size={28} strokeWidth={1.75} />
            </span>
            <span style={{ position: 'relative', zIndex: 1 }}>Get Started</span>
            <span style={{ position: 'relative', zIndex: 1, justifySelf: 'end', display: 'inline-flex', color: 'var(--text)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 12h12M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>

          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: '56px',
              padding: '14px 20px',
              borderRadius: '12px',
              background: 'transparent',
              border: '1px solid var(--text-dim)',
              color: 'var(--text)',
              fontFamily: barlow.style.fontFamily,
              fontSize: '16px',
              fontWeight: 500,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            Log in
          </Link>
        </div>
      </main>

      <div
        style={{
          width: '100%',
          marginTop: 'auto',
          lineHeight: 0,
          position: 'relative',
          background: 'var(--ink)',
          paddingBottom: 52,
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            lineHeight: 0,
            position: 'relative',
            maskImage:
              'linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)',
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }}
        >
          <Image
            src="/hero-silhouette.png"
            alt=""
            width={1200}
            height={300}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'cover',
              objectPosition: 'center bottom',
              marginTop: -52,
              opacity: 0.82,
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--ink), var(--rust) 22%) 0%, color-mix(in srgb, var(--ink), var(--rust) 12%) 40%, var(--ink) 100%)',
              mixBlendMode: 'multiply',
              opacity: 0.72,
            }}
          />
        </div>
        <LandingFeatureStrip />
      </div>
    </div>
  )
}
