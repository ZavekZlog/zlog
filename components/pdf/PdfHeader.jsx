'use client'

import { View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer'
import {
  PDF_FOOTER_BLOCK_H,
  PDF_FOOTER_TOP,
  PDF_PAGE_MARGIN_TOP,
  PDF_PAGE_PAD_X,
  resolvePdfAccent,
} from '@/lib/diary-pdf-layout'

const ZLOG_URL = 'https://zlog.app'
const INK = '#20252B'
const MUTED = '#66707A'
const RULE = '#D3D8DD'

/**
 * Masthead for every page.
 *
 * All chrome is inset to the print margin — nothing is full-bleed — so the
 * company accent can never paint pixels into a physical page edge or corner.
 * The accent appears only as a short rule segment beneath the company block.
 */
export function PdfHeader({
  brandColor = null,
  logoUrl = null,
  companyName = '',
  reportTitle = '',
}) {
  const color = resolvePdfAccent(brandColor)

  const styles = StyleSheet.create({
    header: {
      position: 'absolute',
      top: PDF_PAGE_MARGIN_TOP,
      left: PDF_PAGE_PAD_X,
      right: PDF_PAGE_PAD_X,
      flexDirection: 'column',
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    logo: {
      width: 40,
      height: 34,
      objectFit: 'contain',
      marginRight: 12,
    },
    textBlock: {
      flex: 1,
      flexDirection: 'column',
      paddingRight: 16,
    },
    company: {
      color: INK,
      fontSize: 11,
      fontFamily: 'Helvetica-Bold',
      letterSpacing: 0.25,
    },
    title: {
      color: MUTED,
      fontSize: 7.5,
      marginTop: 3,
      fontFamily: 'Helvetica',
      letterSpacing: 0.2,
    },
    documentMark: {
      color: MUTED,
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      textTransform: 'uppercase',
      letterSpacing: 1.3,
      textAlign: 'right',
      paddingBottom: 1,
    },
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 9,
    },
    accentRule: {
      width: 44,
      height: 1.6,
      backgroundColor: color,
    },
    hairRule: {
      flex: 1,
      height: 0.6,
      backgroundColor: RULE,
    },
  })

  return (
    <View style={styles.header} fixed>
      <View style={styles.identityRow}>
        {logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image
          <Image src={logoUrl} style={styles.logo} />
        ) : null}
        <View style={styles.textBlock}>
          {companyName ? <Text style={styles.company}>{companyName}</Text> : null}
          {reportTitle ? <Text style={styles.title}>{reportTitle}</Text> : null}
        </View>
        <Text style={styles.documentMark}>Site Diary</Text>
      </View>
      <View style={styles.ruleRow}>
        <View style={styles.accentRule} />
        <View style={styles.hairRule} />
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
    // Three equal parts, matching the opening page so the footer reads the
    // same wherever the reader opens the report.
    brandLink: {
      width: '33.33%',
      fontSize: 7,
      color: MUTED,
      fontFamily: 'Helvetica',
      textDecoration: 'none',
    },
    // Reserves the centre third; the page number itself is painted over it by
    // a separate node (see below).
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
      {/* A `render` callback nested inside a fixed container is never
          evaluated, which left every page after the first unnumbered. The
          dynamic node has to be fixed in its own right. */}
      <Text
        style={styles.pageText}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  )
}