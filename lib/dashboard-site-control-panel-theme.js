/**
 * Industrial Site Control Panel — dashboard 5-card module materials only.
 * Does not replace lib/report-theme.js accents used elsewhere (hub, workbench, rails).
 * Hero WebPs: public/zlog/site-control-panel/*-artifact.webp (signed-off final crops).
 */

export const DASHBOARD_SITE_CONTROL_THEMES = {
  diary: {
    accent: '52, 96, 158',
    coatClass: 'zlog-scp-coat--diary',
    heroScaleClass: 'zlog-scp-hero--emphasis',
  },
  survey: {
    accent: '224, 168, 28',
    coatClass: 'zlog-scp-coat--survey',
    heroScaleClass: 'zlog-scp-hero--emphasis',
  },
  progress: {
    accent: '158, 38, 36',
    coatClass: 'zlog-scp-coat--progress',
    heroScaleClass: 'zlog-scp-hero--progress',
  },
  snag: {
    accent: '48, 130, 124',
    coatClass: 'zlog-scp-coat--snag',
    heroScaleClass: 'zlog-scp-hero--emphasis',
  },
  healthSafety: {
    accent: '42, 122, 58',
    coatClass: 'zlog-scp-coat--hs',
    heroScaleClass: 'zlog-scp-hero--emphasis',
  },
}

export function getDashboardSiteControlTheme(moduleId) {
  return DASHBOARD_SITE_CONTROL_THEMES[moduleId] || DASHBOARD_SITE_CONTROL_THEMES.diary
}

/** Scoped industrial panel CSS — import only on app/dashboard/page.jsx */
export const dashboardSiteControlPanelCss = `
  .zlog-site-control-panel {
    position: relative;
    box-sizing: border-box;
    padding: 16px 14px 18px;
    --scp-hero-plate-h: 76px;
    --scp-hero-plate-w: calc(100% - 10px);
    --scp-hero-plate-radius: 8px;
    --scp-hero-plate-border: 2px;
    --scp-plate-rivet-size: 5px;
    --scp-plate-rivet-inset: 5px;
    border-radius: 20px;
    border: 2px solid color-mix(in srgb, var(--text) 12%, var(--ink) 88%);
    background:
      linear-gradient(168deg, color-mix(in srgb, var(--ink) 82%, #1a1c22) 0%, var(--ink) 42%, color-mix(in srgb, var(--ink) 94%, #000) 100%);
    box-shadow:
      inset 0 2px 0 color-mix(in srgb, var(--text), transparent 90%),
      inset 0 -14px 28px color-mix(in srgb, var(--ink), transparent 8%),
      inset 0 0 0 1px color-mix(in srgb, var(--ink) 70%, transparent),
      0 12px 32px color-mix(in srgb, var(--ink) 72%, transparent);
  }

  .zlog-site-control-panel__bezel {
    pointer-events: none;
    position: absolute;
    inset: 6px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 80%, transparent);
  }

  .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap > .zlog-scp-card {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
  }

  .zlog-scp-card {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 10px 9px 9px;
    margin: 0;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    font-family: inherit;
    color: var(--text);
    border-radius: 14px;
    border: 2px solid color-mix(in srgb, var(--scp-accent, var(--text)) 28%, var(--ink) 72%);
    min-height: 0;
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text), transparent 82%),
      inset 0 -8px 16px color-mix(in srgb, var(--ink), transparent 35%),
      0 6px 18px color-mix(in srgb, var(--ink) 55%, transparent);
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), filter 220ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .zlog-scp-card::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.35;
    background:
      repeating-linear-gradient(
        118deg,
        transparent 0 11px,
        color-mix(in srgb, var(--ink), transparent 55%) 11px 12px
      );
    mix-blend-mode: soft-light;
  }

  .zlog-scp-card:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .zlog-scp-coat--diary {
    background:
      linear-gradient(155deg, rgba(62, 102, 158, 0.97) 0%, rgba(38, 68, 118, 0.98) 42%, rgba(26, 48, 88, 0.99) 100%);
    border-color: color-mix(in srgb, #4a7ec4 50%, var(--ink) 50%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text), transparent 82%),
      inset 0 -8px 16px color-mix(in srgb, var(--ink), transparent 35%),
      0 6px 18px color-mix(in srgb, var(--ink) 55%, transparent),
      0 0 0 1px rgba(74, 126, 196, 0.22);
  }

  .zlog-scp-coat--survey {
    background:
      linear-gradient(158deg, rgba(248, 196, 32, 0.98) 0%, rgba(224, 168, 18, 0.98) 42%, rgba(184, 132, 8, 0.99) 100%);
    border-color: color-mix(in srgb, #a87808 45%, var(--ink) 55%);
  }

  .zlog-scp-coat--progress {
    background:
      linear-gradient(155deg, rgba(176, 48, 44, 0.94) 0%, rgba(120, 28, 28, 0.97) 48%, rgba(82, 18, 18, 0.99) 100%);
  }

  .zlog-scp-coat--snag {
    background:
      linear-gradient(155deg, rgba(58, 142, 136, 0.94) 0%, rgba(38, 108, 104, 0.97) 46%, rgba(24, 72, 68, 0.99) 100%);
  }

  .zlog-scp-coat--hs {
    background:
      linear-gradient(155deg, rgba(58, 142, 78, 0.92) 0%, rgba(34, 98, 52, 0.96) 46%, rgba(22, 68, 36, 0.98) 100%);
  }

  .zlog-scp-frame {
    pointer-events: none;
    position: absolute;
    inset: 3px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    box-shadow: inset 0 2px 4px color-mix(in srgb, var(--ink) 65%, transparent);
  }

  .zlog-scp-edge-accent {
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 14px 14px 0 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(var(--scp-accent), 0.85) 18%,
      color-mix(in srgb, var(--text) 40%, transparent) 50%,
      rgba(var(--scp-accent), 0.85) 82%,
      transparent 100%
    );
    box-shadow: 0 0 10px rgba(var(--scp-accent), 0.28);
  }

  .zlog-scp-rivets {
    pointer-events: none;
    position: absolute;
    inset: 7px 8px auto 8px;
    height: 0;
  }

  .zlog-scp-rivets::before,
  .zlog-scp-rivets::after {
    content: '';
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--text) 35%, transparent), color-mix(in srgb, var(--ink) 20%, var(--text) 12%) 55%, color-mix(in srgb, var(--ink) 70%, transparent) 100%);
    border: 1px solid color-mix(in srgb, var(--ink) 60%, var(--text) 15%);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%);
  }

  .zlog-scp-rivets::before { top: 0; left: 0; }
  .zlog-scp-rivets::after { top: 0; right: 0; }

  .zlog-scp-rivet-corner {
    pointer-events: none;
    position: absolute;
    bottom: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--text) 35%, transparent), color-mix(in srgb, var(--ink) 20%, var(--text) 12%) 55%, color-mix(in srgb, var(--ink) 70%, transparent) 100%);
    border: 1px solid color-mix(in srgb, var(--ink) 60%, var(--text) 15%);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%);
  }

  .zlog-scp-rivet-corner--bl { left: 8px; }
  .zlog-scp-rivet-corner--br { right: 8px; }
  .zlog-scp-rivet-corner--tl { top: 8px; left: 8px; bottom: auto; }
  .zlog-scp-rivet-corner--tr { top: 8px; right: 8px; bottom: auto; left: auto; }

  .zlog-scp-hero-stage {
    position: relative;
    z-index: 1;
    width: 100%;
    flex: 0 0 auto;
    margin-bottom: 4px;
    min-height: 100px;
  }

  .zlog-scp-hero-bay {
    width: 100%;
    min-height: 100px;
    max-height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
    border-radius: 9px;
    box-sizing: border-box;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .zlog-scp-hero-plate {
    position: relative;
    box-sizing: border-box;
    width: var(--scp-hero-plate-w);
    height: var(--scp-hero-plate-h);
    min-height: var(--scp-hero-plate-h);
    max-height: var(--scp-hero-plate-h);
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    border-radius: var(--scp-hero-plate-radius);
    border: var(--scp-hero-plate-border) solid color-mix(in srgb, var(--scp-accent) 42%, var(--ink) 58%);
    background: linear-gradient(
      168deg,
      rgba(var(--scp-accent), 0.38) 0%,
      rgba(var(--scp-accent), 0.22) 52%,
      color-mix(in srgb, var(--ink) 28%, transparent) 100%
    );
    box-shadow:
      inset 0 2px 0 color-mix(in srgb, var(--text) 22%, transparent),
      inset 0 -3px 8px color-mix(in srgb, var(--ink) 38%, transparent),
      0 1px 0 color-mix(in srgb, var(--text) 10%, transparent);
  }

  .zlog-scp-coat--survey .zlog-scp-hero-bay {
    background:
      linear-gradient(180deg, rgba(255, 220, 80, 0.38) 0%, rgba(200, 148, 16, 0.46) 100%);
  }

  .zlog-scp-coat--survey .zlog-scp-hero-plate {
    background:
      linear-gradient(168deg, rgba(248, 196, 32, 0.78) 0%, rgba(200, 148, 16, 0.92) 55%, rgba(168, 118, 8, 0.96) 100%);
    border-color: color-mix(in srgb, #c89810 58%, var(--ink) 42%);
  }

  .zlog-scp-coat--diary .zlog-scp-hero-bay {
    background:
      linear-gradient(180deg, rgba(88, 132, 196, 0.42) 0%, rgba(52, 88, 148, 0.5) 100%);
  }

  .zlog-scp-coat--diary .zlog-scp-hero-plate {
    background:
      linear-gradient(168deg, rgba(98, 142, 208, 0.82) 0%, rgba(58, 98, 168, 0.94) 52%, rgba(38, 68, 118, 0.98) 100%);
    border-color: color-mix(in srgb, #6a9ed8 55%, var(--ink) 45%);
  }

  .zlog-scp-coat--progress .zlog-scp-hero-bay {
    background:
      linear-gradient(180deg, rgba(176, 48, 44, 0.36) 0%, rgba(96, 22, 22, 0.44) 100%);
  }

  .zlog-scp-coat--progress .zlog-scp-hero-plate {
    background:
      linear-gradient(168deg, rgba(176, 48, 44, 0.76) 0%, rgba(112, 28, 28, 0.9) 52%, rgba(72, 18, 18, 0.96) 100%);
    border-color: color-mix(in srgb, #9a2828 52%, var(--ink) 48%);
  }

  .zlog-scp-coat--hs .zlog-scp-hero-bay {
    background: transparent;
  }

  .zlog-scp-coat--hs .zlog-scp-hero-plate {
    background:
      linear-gradient(168deg, rgba(68, 152, 92, 0.74) 0%, rgba(42, 112, 62, 0.9) 52%, rgba(24, 72, 40, 0.96) 100%);
    border-color: color-mix(in srgb, #3a9460 52%, var(--ink) 48%);
    overflow: hidden;
    --scp-plate-rivet-size: 7px;
    --scp-plate-rivet-inset: 4px;
  }

  .zlog-scp-coat--hs .zlog-scp-plate-rivet {
    z-index: 2;
    border: 1px solid color-mix(in srgb, var(--ink) 70%, var(--text) 16%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text) 78%, transparent),
      0 0 0 1px color-mix(in srgb, var(--ink) 62%, transparent);
  }

  .zlog-scp-coat--hs .zlog-scp-approved-art {
    position: relative;
    z-index: 1;
    max-width: calc(100% - 12px);
    max-height: calc(100% - 10px);
    object-position: center center;
  }

  .zlog-scp-coat--snag .zlog-scp-hero-bay {
    background:
      linear-gradient(180deg, rgba(58, 142, 136, 0.4) 0%, rgba(28, 88, 84, 0.48) 100%);
  }

  .zlog-scp-coat--snag .zlog-scp-hero-plate {
    background:
      linear-gradient(168deg, rgba(68, 152, 146, 0.76) 0%, rgba(42, 112, 108, 0.9) 52%, rgba(24, 72, 68, 0.96) 100%);
    border-color: color-mix(in srgb, #3a8884 52%, var(--ink) 48%);
  }

  .zlog-scp-plate-rivet {
    pointer-events: none;
    position: absolute;
    width: var(--scp-plate-rivet-size);
    height: var(--scp-plate-rivet-size);
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      color-mix(in srgb, var(--text) 32%, transparent),
      color-mix(in srgb, var(--ink) 22%, var(--text) 10%) 55%,
      color-mix(in srgb, var(--ink) 72%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--ink) 62%, var(--text) 12%);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--text) 70%, transparent);
  }

  .zlog-scp-plate-rivet--tl {
    top: var(--scp-plate-rivet-inset);
    left: var(--scp-plate-rivet-inset);
  }

  .zlog-scp-plate-rivet--tr {
    top: var(--scp-plate-rivet-inset);
    right: var(--scp-plate-rivet-inset);
  }

  .zlog-scp-plate-rivet--bl {
    bottom: var(--scp-plate-rivet-inset);
    left: var(--scp-plate-rivet-inset);
  }

  .zlog-scp-plate-rivet--br {
    bottom: var(--scp-plate-rivet-inset);
    right: var(--scp-plate-rivet-inset);
  }


  .zlog-scp-coat--diary .zlog-scp-edge-accent {
    box-shadow: 0 0 12px rgba(var(--scp-accent), 0.38);
  }

  .zlog-scp-approved-art {
    width: auto;
    max-width: calc(100% - 4px);
    height: auto;
    max-height: calc(100% - 2px);
    object-fit: contain;
    object-position: center bottom;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    filter:
      drop-shadow(0 2px 3px color-mix(in srgb, var(--ink) 72%, transparent))
      drop-shadow(0 6px 14px color-mix(in srgb, var(--ink) 58%, transparent));
  }

  .zlog-scp-hero--emphasis .zlog-scp-approved-art {
    transform: scale(1.14);
    transform-origin: center center;
  }

  .zlog-scp-hero--standard .zlog-scp-approved-art {
    transform: scale(1.08);
    transform-origin: center center;
  }

  .zlog-scp-hero--progress .zlog-scp-approved-art {
    transform: scale(1.12);
    transform-origin: center center;
  }

  .zlog-scp-chevron {
    position: absolute;
    right: 6px;
    bottom: 5px;
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    color: #8a9099;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.58),
      0 0 1px rgba(0, 0, 0, 0.48);
    pointer-events: none;
    opacity: 0.88;
  }

  .zlog-scp-copy {
    position: relative;
    z-index: 2;
    width: 100%;
    flex: 0 1 auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
    padding: 5px 24px 5px 6px;
    margin-top: 0;
    border-radius: 0 0 10px 10px;
    background: color-mix(in srgb, var(--ink) 62%, transparent);
    box-shadow: inset 0 4px 10px color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .zlog-scp-coat--survey .zlog-scp-copy {
    background: linear-gradient(180deg, rgba(168, 118, 8, 0.78) 0%, rgba(108, 72, 4, 0.92) 100%);
    box-shadow: inset 0 3px 10px rgba(56, 38, 2, 0.32);
  }

  .zlog-scp-coat--diary .zlog-scp-copy {
    background: linear-gradient(180deg, rgba(14, 28, 54, 0.82) 0%, rgba(6, 12, 28, 0.94) 100%);
    box-shadow: inset 0 3px 9px rgba(4, 8, 18, 0.35);
  }

  .zlog-scp-coat--progress .zlog-scp-copy {
    background: linear-gradient(180deg, rgba(72, 18, 18, 0.72) 0%, rgba(38, 8, 8, 0.9) 100%);
  }

  .zlog-scp-coat--snag .zlog-scp-copy {
    background: linear-gradient(180deg, rgba(26, 72, 68, 0.74) 0%, rgba(12, 42, 40, 0.9) 100%);
  }

  .zlog-scp-coat--hs .zlog-scp-copy {
    background: linear-gradient(180deg, rgba(22, 72, 40, 0.72) 0%, rgba(10, 48, 26, 0.9) 100%);
  }

  .zlog-scp-card-title {
    position: relative;
    z-index: 1;
    font-weight: 700;
    font-size: 16px;
    color: #eef1f3;
    margin-bottom: 2px;
    line-height: 1.18;
    letter-spacing: -0.014em;
    text-wrap: balance;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.68),
      0 -1px 0 rgba(255, 255, 255, 0.1),
      0 0 1px rgba(0, 0, 0, 0.5);
  }

  .zlog-scp-card-desc {
    position: relative;
    z-index: 1;
    font-size: 15px;
    font-weight: 500;
    color: #d7dde1;
    line-height: 1.22;
    margin: 0;
    width: 100%;
    min-height: 0;
    display: block;
    overflow: visible;
    overflow-wrap: break-word;
    text-wrap: balance;
    flex: 0 1 auto;
    text-shadow:
      0 1px 0 rgba(0, 0, 0, 0.62),
      0 0 1px rgba(0, 0, 0, 0.42);
  }

  .zlog-site-control-panel .premium-dash-card-wrap:hover .zlog-scp-card:not(:disabled) {
    transform: translateY(-5px) scale(1.012);
    filter: brightness(1.05);
    border-color: rgba(var(--scp-accent), 0.55);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--text), transparent 78%),
      0 14px 32px color-mix(in srgb, var(--ink) 58%, transparent),
      0 0 28px rgba(var(--scp-accent), 0.26);
  }

  .zlog-site-control-panel .premium-dash-card-wrap .zlog-scp-card:not(:disabled):active {
    transform: scale(0.985);
    transition-duration: 120ms;
  }

  .zlog-site-control-panel .premium-dash-card-wrap:hover .zlog-scp-card:not(:disabled):active {
    transform: translateY(-5px) scale(0.985);
  }

  .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap.zlog-scp-wrap--centre {
    grid-column: 1 / -1;
    justify-self: center;
    width: calc((100% - var(--dash-gap)) / 2);
    max-width: calc((100% - var(--dash-gap)) / 2);
  }

  @media (max-width: 768px) {
    .zlog-site-control-panel {
      padding: 8px 6px 10px;
      --scp-hero-plate-h: 86px;
      --scp-hero-plate-w: min(100%, calc(100% - 8px));
    }

    .zlog-site-control-panel .premium-dash-cards-grid {
      --dash-gap: 9px;
      --scp-m-hero-h: 104px;
      --scp-m-copy-h: 96px;
      --scp-m-title-h: calc(18px * 1.16);
      --scp-m-desc-block-h: calc(16px * 1.22 * 3);
      --scp-m-card-h: calc(5px + var(--scp-m-hero-h) + 1px + var(--scp-m-copy-h) + 4px);
      --scp-m-plate-h: 86px;
      --scp-m-plate-w: min(100%, calc(100% - 6px));
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap {
      display: flex;
      min-height: var(--scp-m-card-h);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-card {
      flex: 1 1 auto;
      height: var(--scp-m-card-h);
      min-height: var(--scp-m-card-h);
      max-height: var(--scp-m-card-h);
      padding: 5px 5px 4px;
      box-sizing: border-box;
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero-stage {
      flex: 0 0 var(--scp-m-hero-h);
      height: var(--scp-m-hero-h);
      min-height: var(--scp-m-hero-h);
      max-height: var(--scp-m-hero-h);
      margin-bottom: 1px;
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero-bay {
      height: 100%;
      min-height: 0;
      max-height: none;
      padding: 2px 4px;
      box-sizing: border-box;
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero-plate {
      width: var(--scp-m-plate-w);
      height: var(--scp-m-plate-h);
      min-height: var(--scp-m-plate-h);
      max-height: var(--scp-m-plate-h);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-approved-art {
      max-height: calc(100% - 2px);
      filter:
        drop-shadow(0 2px 4px color-mix(in srgb, var(--ink) 68%, transparent))
        drop-shadow(0 7px 12px color-mix(in srgb, var(--ink) 52%, transparent));
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero--emphasis .zlog-scp-approved-art {
      transform: scale(1.18);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero--standard .zlog-scp-approved-art {
      transform: scale(1.1);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-hero--progress .zlog-scp-approved-art {
      transform: scale(1.14);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-copy {
      flex: 0 0 var(--scp-m-copy-h);
      height: var(--scp-m-copy-h);
      min-height: var(--scp-m-copy-h);
      max-height: var(--scp-m-copy-h);
      padding: 4px 22px 4px 6px;
      margin-top: 0;
      box-sizing: border-box;
      box-shadow: inset 0 3px 8px color-mix(in srgb, var(--ink) 22%, transparent);
      gap: 1px;
      overflow: hidden;
      justify-content: flex-start;
    }

    .zlog-scp-coat--survey .zlog-scp-copy {
      box-shadow: inset 0 3px 10px rgba(56, 38, 2, 0.28);
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-card-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.16;
      height: var(--scp-m-title-h);
      min-height: var(--scp-m-title-h);
      max-height: var(--scp-m-title-h);
      margin: 0;
      letter-spacing: -0.022em;
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
      color: #eef1f3;
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-card-desc {
      font-size: 16px;
      font-weight: 500;
      line-height: 1.22;
      flex: 0 0 auto;
      height: var(--scp-m-desc-block-h);
      min-height: var(--scp-m-desc-block-h);
      max-height: var(--scp-m-desc-block-h);
      margin: 0;
      overflow: hidden;
      text-overflow: clip;
      text-wrap: balance;
      align-self: stretch;
      color: #d7dde1;
    }

    .zlog-site-control-panel .premium-dash-cards-grid > .premium-dash-card-wrap .zlog-scp-chevron {
      right: 5px;
      bottom: 4px;
      font-size: 19px;
    }
  }

  /* Dashboard-only signed-off Zlog wordmark — Space Grotesk, flat Z, silver log, no glow */
  .dashboard-premium-bg .zlog-dashboard-topbar [data-zlog-brand-glow] {
    display: none;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar {
    padding-bottom: 2px !important;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar .zlog-brand-region {
    min-height: 48px;
    padding-top: 14px;
    padding-bottom: 0;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar .zlog-brand-wordmark {
    transform: none;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar .zlog-brand-wordmark h1 {
    font-family: var(--font-space-grotesk), system-ui, sans-serif;
    font-weight: 700;
    font-size: 26px;
    letter-spacing: -0.02em;
    transform: none;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar .zlog-brand-wordmark h1 span:first-child {
    color: #db3d06;
    text-shadow: none;
    filter: none;
  }

  .dashboard-premium-bg .zlog-dashboard-topbar .zlog-brand-wordmark h1 span:last-child {
    color: #e8eaed;
    text-shadow: none;
  }
`
