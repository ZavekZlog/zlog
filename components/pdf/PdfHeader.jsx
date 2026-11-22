import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import {
  PDF_FOOTER_BLOCK_H,
  PDF_FOOTER_TOP,
  PDF_HEADER_BLOCK_H,
  PDF_PAGE_MARGIN_TOP,
  PDF_PAGE_PAD_X,
  resolvePdfBannerColor,
} from '@/lib/diary-pdf-layout'

const MUTED = '#66707A'
const RULE = '#D3D8DD'

/** Same coloured banner height as page-1 DAILY SITE DIARY chrome. */
export const PDF_ACCENT_BANNER_H = PDF_HEADER_BLOCK_H

/**
 * Coloured masthead banner for every page, including pages created by overflow.
 * Fixed and out of flow, so a wrapping page repeats it. Page padding reserves
 * the space it occupies.
 *
 * Never full-bleed — sits inside PDF_PAGE_PAD_X via page horizontal padding.
 */
export function PdfHeader({
  brandColor = null,
  logoUrl = null,
  reportTitle = '',
  projectName = '',
  projectReference = '',
  edgeBleed = 0,
}) {
  const color = resolvePdfBannerColor(brandColor)
  const title = String(reportTitle || 'DAILY SITE DIARY').trim() || 'DAILY SITE DIARY'
  const name = String(projectName || '').trim()
  const reference = String(projectReference || '').trim()
  const bleed = Number(edgeBleed) || 0

  const styles = StyleSheet.create({
    headerShell: {
      position: 'absolute',
      top: PDF_PAGE_MARGIN_TOP,
      left: PDF_PAGE_PAD_X - bleed,
      right: PDF_PAGE_PAD_X - bleed,
      height: PDF_ACCENT_BANNER_H,
    },
    // Inner fill: backgroundColor on a nested view is more reliable across
    // wrap pages than putting the fill only on the fixed shell.
    headerFill: {
      width: '100%',
      height: '100%',
      backgroundColor: color,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      position: 'relative',
    },
    logo: {
      width: 68,
      height: 32,
      objectFit: 'contain',
    },
    logoSpacer: {
      width: 68,
      height: 32,
    },
    titleCenter: {
      position: 'absolute',
      left: 86,
      right: 124,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 1.4,
      textAlign: 'center',
    },
    referenceSlot: {
      width: 116,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    reference: {
      color: '#FFFFFF',
      fontSize: 8,
      fontFamily: 'Helvetica',
      textAlign: 'right',
    },
  })

  return (
    <View style={styles.headerShell} fixed>
      <View style={styles.headerFill}>
        {logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
          <Image src={logoUrl} style={styles.logo} />
        ) : (
          <View style={styles.logoSpacer} />
        )}
        <View style={styles.referenceSlot}>
          {name ? <Text style={styles.reference}>{name}</Text> : null}
          {reference ? <Text style={styles.reference}>{reference}</Text> : null}
          {!name && !reference ? <Text style={styles.reference}> </Text> : null}
        </View>
        <View style={styles.titleCenter}>
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
    </View>
  )
}

/**
 * Footer for every page — inset to the print margin.
 *
 * Anchored from the top with an explicit height: a `fixed` box anchored by
 * `bottom` resolves against an unmeasured page in react-pdf and is emitted at
 * an arbitrary offset, which is how stray painted elements reached page edges.
 * The page number is its own fixed text: a render callback nested inside the
 * fixed footer is never evaluated.
 */
export function PdfFooter({ projectReference = '', reportDate = '' }) {
  const reference = String(projectReference || '').trim()
  const title = 'Daily Site Diary'
  const date = String(reportDate || '').trim()
  const left = [reference, title, date].filter(Boolean).join(' · ') || ' '
  const styles = StyleSheet.create({
    footer: {
      position: 'absolute',
      top: PDF_FOOTER_TOP,
      left: PDF_PAGE_PAD_X,
      right: PDF_PAGE_PAD_X,
      height: PDF_FOOTER_BLOCK_H,
      flexDirection: 'column',
    },
    hairRule: {
      height: 0.6,
      backgroundColor: RULE,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    identityText: {
      width: '82%',
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
      textAlign: 'left',
    },
    pageText: {
      position: 'absolute',
      top: PDF_FOOTER_TOP,
      left: PDF_PAGE_PAD_X,
      right: PDF_PAGE_PAD_X,
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
      textAlign: 'right',
    },
  })

  return (
    <>
      <View style={styles.footer} fixed>
        <View style={styles.row}>
          <Text style={styles.identityText}>{left}</Text>
        </View>
        <View style={styles.hairRule} />
      </View>
      <Text
        style={styles.pageText}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  )
}
