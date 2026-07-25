import Image from 'next/image'
import Link from 'next/link'
import { Space_Grotesk, Barlow } from 'next/font/google'
import { LandingFeatureStrip, LandingMicIcon } from './landing-feature-strip'
import { PrimaryCTA } from '@/lib/premium-ui'

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
          padding: '32px 24px 28px',
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
                'radial-gradient(circle, color-mix(in srgb, var(--rust), transparent 37%) 0%, color-mix(in srgb, var(--rust), transparent 72%) 52%, color-mix(in srgb, var(--rust), transparent 90%) 68%, transparent 84%)',
              pointerEvents: 'none',
              filter: 'blur(60px)',
            }}
          />
          <Image
            src="/z-medium.png"
            alt=""
            width={420}
            height={420}
            priority
            style={{
              position: 'relative',
              width: '91%',
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
            transform: 'translateY(-2px)',
          }}
        >
          Zlog
        </h1>

        <p
          style={{
            margin: '0 0 14px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '17px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'color-mix(in srgb, var(--text) 92%, var(--rust))',
            lineHeight: 1.5,
          }}
        >
          See it{' '}
          <span style={{ color: 'var(--text-dim)' }}>|</span>{' '}
          Say it{' '}
          <span style={{ color: 'var(--text-dim)' }}>|</span>{' '}
          <span style={{ color: 'color-mix(in srgb, var(--rust) 94%, white)', fontWeight: 700 }}>Logged.</span>
        </p>

        <h2
          style={{
            margin: '0 0 4px',
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

        <p
          style={{
            margin: '0 0 4px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '18px',
            fontWeight: 600,
            lineHeight: 1.25,
            color: '#F2F2F2',
            maxWidth: '380px',
          }}
        >
          Professional, company-branded reports that reflect your standards.
        </p>

        <p
          style={{
            margin: '0 0 10px',
            fontFamily: barlow.style.fontFamily,
            fontSize: '16px',
            fontWeight: 400,
            lineHeight: 1.35,
            color: 'color-mix(in srgb, #ffffff 74%, transparent)',
            maxWidth: '320px',
          }}
        >
          Type or use your voice to create reports.
        </p>

        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <PrimaryCTA
            href="/signup"
            style={{ fontFamily: barlow.style.fontFamily }}
          >
            <span
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <span style={{ justifySelf: 'start', display: 'inline-flex', color: 'var(--text)', paddingLeft: 10 }}>
                <LandingMicIcon size={28} strokeWidth={1.75} />
              </span>
              <span>Start 7-Day Free Trial</span>
              <span style={{ justifySelf: 'end', display: 'inline-flex', color: 'var(--text)' }}>
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
            </span>
          </PrimaryCTA>

          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: '46px',
              height: '46px',
              padding: '8px 20px',
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
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.45) 22%, rgba(0,0,0,0.75) 34%, black 48%, black 72%, rgba(0,0,0,0.55) 88%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.45) 22%, rgba(0,0,0,0.75) 34%, black 48%, black 72%, rgba(0,0,0,0.55) 88%, transparent 100%)',
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
              opacity: 0.8,
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
