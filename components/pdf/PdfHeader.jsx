import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import {
  PDF_FOOTER_BLOCK_H,
  PDF_FOOTER_TOP,
  PDF_HEADER_BLOCK_H,
  PDF_PAGE_PAD_X,
  resolvePdfAccent,
} from '@/lib/diary-pdf-layout'

const MUTED = '#66707A'
const RULE = '#D3D8DD'

/** Same coloured banner height as page-1 DAILY SITE DIARY chrome. */
export const PDF_ACCENT_BANNER_H = PDF_HEADER_BLOCK_H

/**
 * Coloured masthead banner for every page.
 *
 * In-flow on each explicit `<Page>` — react-pdf only paints `fixed` + `absolute`
 * chrome reliably on page 1; sibling pages need a deterministic in-flow header
 * with reserved space via page padding + header height.
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
  const color = resolvePdfAccent(brandColor)
  const title = String(reportTitle || 'DAILY SITE DIARY').trim() || 'DAILY SITE DIARY'
  const name = String(projectName || '').trim()
  const reference = String(projectReference || '').trim()
  const bleed = Number(edgeBleed) || 0

  const styles = StyleSheet.create({
    headerShell: {
      height: PDF_ACCENT_BANNER_H,
      marginBottom: 18,
      marginHorizontal: -bleed,
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
    <View style={styles.headerShell}>
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
export function PdfFooter({ projectName = '', projectReference = '' }) {
  const name = String(projectName || '').trim()
  const reference = String(projectReference || '').trim()
  const identity = [name, reference].filter(Boolean).join(' · ') || ' '
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
      marginTop: 6,
    },
    identityText: {
      width: '33.33%',
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
    },
    titleText: {
      width: '33.33%',
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
      textAlign: 'center',
    },
    pageSlot: { width: '33.33%' },
    pageText: {
      position: 'absolute',
      top: PDF_FOOTER_TOP + 6.6,
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
        <View style={styles.hairRule} />
        <View style={styles.row}>
          <Text style={styles.identityText}>{identity}</Text>
          <Text style={styles.titleText}>Daily Site Diary</Text>
          <Text style={styles.pageSlot}> </Text>
        </View>
      </View>
      <Text
        style={styles.pageText}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  )
}
