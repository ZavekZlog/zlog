import Image from 'next/image'
import Link from 'next/link'
import { Space_Grotesk, Barlow } from 'next/font/google'
import { LandingFeatureStrip } from './landing-feature-strip'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

function MicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill="currentColor"
      />
      <path
        d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ShieldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l7 3v5.5c0 4.5-2.9 7.8-7 9.5-4.1-1.7-7-5-7-9.5V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 12.2l1.8 1.8 3.4-3.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
          padding: '56px 24px 40px',
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
            marginBottom: '28px',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: '220px',
              height: '220px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--rust), transparent 65%) 0%, color-mix(in srgb, var(--rust), transparent 88%) 45%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <Image
            src="/riveted-z.png"
            alt=""
            width={200}
            height={200}
            priority
            style={{
              position: 'relative',
              width: 'auto',
              height: '190px',
              objectFit: 'contain',
            }}
          />
        </div>

        <h1
          style={{
            margin: '0 0 20px',
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '42px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
            lineHeight: 1,
          }}
        >
          Zlog
        </h1>

        <p
          style={{
            margin: '0 0 32px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '17px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--text)',
            lineHeight: 1.5,
          }}
        >
          See it <span style={{ color: 'var(--rust)' }}>|</span> Say it{' '}
          <span style={{ color: 'var(--rust)' }}>|</span>{' '}
          <span style={{ color: 'var(--rust)' }}>Logged.</span>
        </p>

        <h2
          style={{
            margin: '0 0 48px',
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '26px',
            fontWeight: 600,
            lineHeight: 1.35,
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
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              minHeight: '56px',
              padding: '14px 20px',
              borderRadius: '12px',
              background: 'var(--rust)',
              color: 'var(--text)',
              fontFamily: barlow.style.fontFamily,
              fontSize: '16px',
              fontWeight: 600,
              textDecoration: 'none',
              boxSizing: 'border-box',
            }}
          >
            <MicIcon />
            Get Started
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

        <p
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'var(--text-dim)',
          }}
        >
          <ShieldIcon />
          Secure & backed up
        </p>
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
            src="/zlog-footer-silhouette.png"
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
            }}
          />
        </div>
        <LandingFeatureStrip />
      </div>
    </div>
  )
}
