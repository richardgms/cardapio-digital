import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
        return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    console.log(`--- DEBUGGING OTP FOR: ${email} ---`)

    // Use Service Role for Admin operations
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        // 1. Get User ID
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        const user = users?.find(u => u.email === email)

        if (!user) {
            return NextResponse.json({ error: 'User not found in Auth' }, { status: 404 })
        }

        // 2. Try Update (Test DB Write/Constraints)
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: { ...user.user_metadata, last_debug_attempt: new Date().toISOString() }
        })

        if (updateError) {
            console.error('Update User Error:', updateError)
            return NextResponse.json({
                success: false,
                step: 'update_user',
                error: updateError.message,
                details: updateError
            }, { status: 500 })
        }

        // 3. Try OTP (Test Email)
        const { data, error } = await supabaseAdmin.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: 'http://localhost:3000/api/auth/callback',
                shouldCreateUser: false // Don't create, just sign in
            },
        })

        if (error) {
            console.error('OTP Error:', error)
            return NextResponse.json({
                success: false,
                step: 'send_otp',
                error: error.message,
                details: error,
                status: error.status
            }, { status: 500 }) // Return 500 to match symptom
        }

        return NextResponse.json({ success: true, step: 'all_passed', data })
    } catch (err: any) {
        console.error('Unexpected OTP Exception:', err)
        return NextResponse.json({
            success: false,
            error: err.message,
            stack: err.stack
        }, { status: 500 })
    }
}
