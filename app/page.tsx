import Image from 'next/image'
import Link from 'next/link'
import { Space_Grotesk, Barlow } from 'next/font/google'
import { LandingFeatureStrip, LandingMicIcon } from './landing-feature-strip'
import { PrimaryCTA, ZlogTextWordmarkLetters } from '@/lib/premium-ui'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const landingTrialCtaStyle = {
  fontFamily: barlow.style.fontFamily,
  minHeight: 48,
  height: 48,
  background:
    'linear-gradient(180deg, #C43C10 0%, #AF330B 5%, #AF330B 78%, #7E2408 90%, #3A1005 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(244, 242, 239, 0.12), inset 0 0 0 2px #1A0A06, inset 0 -6px 8px rgba(11, 13, 18, 0.40), 0 1px 2px rgba(11, 13, 18, 0.36)',
  border: '1px solid #241006',
}

export default function Home() {
  return (
    <div className="zlog-landing">
      <style>{`
        .zlog-landing {
          min-height: 100vh;
          min-height: 100dvh;
          min-height: 100svh;
          display: flex;
          flex-direction: column;
          background: var(--ink);
          color: var(--text);
        }
        .zlog-landing-main {
          flex: 1;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          padding: 32px 24px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .zlog-landing-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          width: 100%;
        }
        .zlog-landing-hero-z-wrap {
          position: relative;
          width: 77%;
          line-height: 0;
        }
        .zlog-landing-hero-z {
          position: relative;
          width: 100%;
          height: auto;
          object-fit: contain;
        }
        .zlog-landing-wordmark {
          margin: 0 0 8px;
        }
        .zlog-landing-headline {
          margin: 0 0 8px;
          max-width: 12em;
        }
        .zlog-landing-slogan {
          margin: 0 0 32px;
        }
        .zlog-landing-actions {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 28px;
        }
        .zlog-landing-silhouette {
          width: 100%;
          margin-top: auto;
          line-height: 0;
          position: relative;
          background: var(--ink);
          padding-bottom: 52px;
        }
        @media (max-width: 480px) {
          .zlog-landing-main {
            padding: 16px 24px 8px;
          }
          .zlog-landing-hero {
            margin-bottom: 4px;
          }
          .zlog-landing-hero-z-wrap {
            width: min(61.1%, 23.5svh);
          }
          .zlog-landing-wordmark {
            margin: 0 0 6px;
          }
          .zlog-landing-headline {
            margin: 0 0 6px;
            max-width: 12em;
          }
          .zlog-landing-slogan {
            margin: 0 0 24px;
          }
          .zlog-landing-actions {
            gap: 8px;
            margin-bottom: 10px;
          }
          .zlog-landing-silhouette {
            padding-bottom: 16px;
            margin-bottom: 12px;
          }
        }
        .zlog-landing-trial-cta > span[aria-hidden]:first-of-type {
          height: 9% !important;
          background: linear-gradient(180deg, rgba(244, 242, 239, 0.11) 0%, transparent 100%) !important;
        }
        .zlog-landing-login {
          min-height: 44px;
          height: 44px;
          padding: 6px 20px;
        }
        @keyframes zlog-landing-enter-z {
          from { opacity: 0.88; transform: scale(0.985); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes zlog-landing-enter-glow {
          from { opacity: 0.55; }
          to { opacity: 1; }
        }
        @keyframes zlog-landing-enter-wordmark {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes zlog-landing-enter-copy {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes zlog-landing-enter-band {
          from { transform: translateY(6px); }
          to { transform: translateY(0); }
        }
        @keyframes zlog-landing-enter-band-content {
          from { opacity: 0.15; }
          to { opacity: 1; }
        }
        .zlog-landing-hero-glow {
          animation: zlog-landing-enter-glow 450ms cubic-bezier(0.33, 0, 0.2, 1) backwards;
        }
        .zlog-landing-hero-z-wrap {
          animation: zlog-landing-enter-z 450ms cubic-bezier(0.33, 0, 0.2, 1) backwards;
        }
        .zlog-landing-wordmark {
          animation: zlog-landing-enter-wordmark 400ms cubic-bezier(0.33, 0, 0.2, 1) 200ms backwards;
        }
        .zlog-landing-headline,
        .zlog-landing-slogan,
        .zlog-landing-actions {
          animation: zlog-landing-enter-copy 450ms cubic-bezier(0.33, 0, 0.2, 1) 300ms backwards;
        }
        .zlog-landing-silhouette {
          animation: zlog-landing-enter-band 400ms cubic-bezier(0.33, 0, 0.2, 1) 450ms backwards;
        }
        .zlog-landing-silhouette .zlog-landing-feature-strip {
          animation: zlog-landing-enter-band-content 400ms cubic-bezier(0.33, 0, 0.2, 1) 450ms backwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .zlog-landing-hero-glow,
          .zlog-landing-hero-z-wrap,
          .zlog-landing-wordmark,
          .zlog-landing-headline,
          .zlog-landing-slogan,
          .zlog-landing-actions,
          .zlog-landing-silhouette,
          .zlog-landing-silhouette .zlog-landing-feature-strip {
            animation: none;
          }
        }
      `}</style>
      <main className="zlog-landing-main">
        <div className="zlog-landing-hero">
          <div
            className="zlog-landing-hero-glow"
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
          <div className="zlog-landing-hero-z-wrap">
            <Image
              className="zlog-landing-hero-z"
              src="/z-medium.png"
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
        </div>

        <h1
          className="zlog-landing-wordmark"
          style={{
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '104px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            lineHeight: 1,
            transform: 'translateY(-2px)',
          }}
        >
          <ZlogTextWordmarkLetters />
        </h1>

        <p
          className="zlog-landing-headline"
          style={{
            fontFamily: spaceGrotesk.style.fontFamily,
            fontSize: '21px',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
            lineHeight: 1.3,
          }}
        >
          Construction reporting. Done properly.
        </p>

        <p
          className="zlog-landing-slogan"
          style={{
            fontFamily: barlow.style.fontFamily,
            fontSize: '17px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: 'color-mix(in srgb, var(--text) 92%, var(--rust))',
            lineHeight: 1.5,
          }}
        >
          See it. Say it.{' '}
          <span style={{ color: '#DB3D06', fontWeight: 700 }}>Logged.</span>
        </p>

        <div className="zlog-landing-actions">
          <PrimaryCTA
            href="/signup"
            className="zlog-landing-trial-cta"
            style={landingTrialCtaStyle}
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
            className="zlog-landing-login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
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

      <div className="zlog-landing-silhouette">
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
            loading="eager"
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
