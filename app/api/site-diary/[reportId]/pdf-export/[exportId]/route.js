import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'

import { resolveReadySiteDiaryPdfExportArtifact } from '@/lib/server/site-diary-pdf-export-access-logic.js'



export const runtime = 'nodejs'



function sanitizeDispositionFileName(fileName) {

  return String(fileName || 'Zlog-Site-Diary.pdf').replace(/[^\w.\-]+/g, '_')

}



export async function GET(_request, context) {

  const params = await context.params

  const reportId = params?.reportId

  const exportId = params?.exportId



  const userSupabase = await createClient()

  let admin

  try {

    admin = getSupabaseAdminClient()

  } catch {

    return NextResponse.json(

      { ok: false, code: 'server-config', message: 'Server misconfigured.' },

      { status: 503 },

    )

  }



  const result = await resolveReadySiteDiaryPdfExportArtifact({

    userSupabase,

    adminSupabase: admin,

    reportId,

    exportId,

  })



  if (!result.ok) {

    return NextResponse.json(

      {

        ok: false,

        code: result.code,

        message: result.message || undefined,

        exportStatus: result.exportStatus || undefined,

      },

      { status: result.status },

    )

  }



  const safeName = sanitizeDispositionFileName(result.fileName)



  return NextResponse.json(

    {

      ok: true,

      signedUrl: result.signedUrl,

      expiresInSeconds: result.expiresInSeconds,

      fileName: safeName,

      title: result.title,

      text: result.text,

      exportId: result.exportId,

      reportId: result.reportId,

    },

    {

      status: 200,

      headers: {

        'Cache-Control': 'no-store',

      },

    },

  )

}
