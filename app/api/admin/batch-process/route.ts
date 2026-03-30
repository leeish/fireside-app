import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/inngest/client'

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Trigger batch processing immediately
    await inngest.send({
      name: 'fireside/batch-process-pending',
      data: {},
    })

    return NextResponse.json({
      success: true,
      message: 'Batch processing triggered',
    })
  } catch (error) {
    console.error('Batch process endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger batch processing' },
      { status: 500 }
    )
  }
}
