'use client'

import { View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer'
import {
  PDF_FOOTER_BLOCK_H,
  PDF_FOOTER_TOP,
  PDF_HEADER_BLOCK_H,
  PDF_PAGE_PAD_X,
  resolvePdfAccent,
} from '@/lib/diary-pdf-layout'

const ZLOG_URL = 'https://zlog.app'
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
  companyName = '',
  reportTitle = '',
}) {
  const color = resolvePdfAccent(brandColor)
  const title = String(reportTitle || 'DAILY SITE DIARY').trim() || 'DAILY SITE DIARY'

  const styles = StyleSheet.create({
    headerShell: {
      height: PDF_ACCENT_BANNER_H,
      marginBottom: 18,
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
    titleBlock: {
      flex: 1,
      paddingLeft: 12,
      alignItems: 'flex-end',
    },
    title: {
      color: '#FFFFFF',
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 1.4,
      textAlign: 'right',
    },
    company: {
      color: '#FFFFFF',
      fontSize: 7.5,
      fontFamily: 'Helvetica',
      marginTop: 2,
      textAlign: 'right',
      opacity: 0.92,
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
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {companyName ? <Text style={styles.company}>{companyName}</Text> : null}
        </View>
      </View>
    </View>
  )
}

/**
 * Footer for every page — inset to the print margin so the Zlog attribution
 * always sits inside the safe zone and is never clipped by the page edge.
 *
 * Anchored from the top with an explicit height: a `fixed` box anchored by
 * `bottom` resolves against an unmeasured page in react-pdf and is emitted at
 * an arbitrary offset, which is how stray painted elements reached page edges.
 */
export function PdfFooter({ reportReference = '' }) {
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
    brandLink: {
      width: '33.33%',
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
      textDecoration: 'none',
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
      textAlign: 'center',
    },
    referenceText: {
      width: '33.33%',
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
          <Link src={ZLOG_URL} style={styles.brandLink}>
            Produced with Zlog
          </Link>
          <Text style={styles.pageSlot}> </Text>
          <Text style={styles.referenceText}>
            {reportReference ? `Report reference: ${reportReference}` : ' '}
          </Text>
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
