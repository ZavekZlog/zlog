'use client'

/**
 * Display original photograph with a transparent annotation overlay on top.
 * Does not flatten — both layers remain separate in the DOM.
 */
export function PhotoAnnotationViewer({
  imageSrc,
  overlaySrc = null,
  alt = '',
  width = 88,
  height = 88,
  style = {},
}) {
  if (!imageSrc) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          ...style,
        }}
      />
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG */}
      <img
        src={imageSrc}
        alt={alt}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
      {overlaySrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESLINT-PHOTO-001-IMG
        <img
          src={overlaySrc}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  )
}
