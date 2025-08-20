import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role key for admin operations
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	}
)

// Clerk webhook event types
type ClerkWebhookEvent = {
	type: string
	data: {
		id: string
		email_addresses: Array<{
			email_address: string
			id: string
		}>
		first_name?: string
		last_name?: string
		image_url?: string
		created_at: number
		updated_at: number
	}
}

export async function POST(req: NextRequest) {
	// Get the headers
	const headerPayload = await headers()
	const svix_id = headerPayload.get('svix-id')
	const svix_timestamp = headerPayload.get('svix-timestamp')
	const svix_signature = headerPayload.get('svix-signature')

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new NextResponse('Error occurred -- no svix headers', {
			status: 400,
		})
	}

	// Get the body
	const payload = await req.json()
	const body = JSON.stringify(payload)

	// Create a new Svix instance with your secret
	const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)

	let evt: ClerkWebhookEvent

	// Verify the payload with the headers
	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		}) as ClerkWebhookEvent
	} catch (err) {
		console.error('Error verifying webhook:', err)
		return new NextResponse('Error occurred', {
			status: 400,
		})
	}

	// Handle the webhook
	try {
		await handleClerkWebhook(evt)
		return new NextResponse('Success', { status: 200 })
	} catch (error) {
		console.error('Error handling webhook:', error)
		return new NextResponse('Error processing webhook', { status: 500 })
	}
}

async function handleClerkWebhook(evt: ClerkWebhookEvent) {
	const { type, data } = evt

	console.log(`Processing Clerk webhook: ${type} for user ${data.id}`)

	switch (type) {
		case 'user.created':
			await handleUserCreated(data)
			break
		case 'user.updated':
			await handleUserUpdated(data)
			break
		case 'user.deleted':
			await handleUserDeleted(data)
			break
		default:
			console.log(`Unhandled webhook type: ${type}`)
	}
}

async function handleUserCreated(userData: ClerkWebhookEvent['data']) {
	const primaryEmail = userData.email_addresses.find(
		(email) => email.id === userData.email_addresses[0]?.id
	)?.email_address

	if (!primaryEmail) {
		throw new Error('No primary email found for user')
	}

	const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || null

	// Insert user into Supabase
	const { data, error } = await supabase
		.from('users')
		.insert({
			clerk_user_id: userData.id,
			email: primaryEmail,
			full_name: fullName,
			avatar_url: userData.image_url || null,
		})
		.select()
		.single()

	if (error) {
		console.error('Error creating user in Supabase:', error)
		throw error
	}

	// Create default user settings
	const { error: settingsError } = await supabase.from('user_settings').insert({
		user_id: data.id,
		units: 'metric',
		privacy_level: 'friends',
		notifications_enabled: true,
		auto_pause_enabled: true,
		gps_accuracy: 'high',
	})

	if (settingsError) {
		console.error('Error creating user settings:', settingsError)
		// Don't throw here - user creation succeeded, settings can be created later
	}

	console.log(`Successfully created user ${userData.id} in Supabase`)
}

async function handleUserUpdated(userData: ClerkWebhookEvent['data']) {
	const primaryEmail = userData.email_addresses.find(
		(email) => email.id === userData.email_addresses[0]?.id
	)?.email_address

	if (!primaryEmail) {
		throw new Error('No primary email found for user')
	}

	const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || null

	// Update user in Supabase
	const { error } = await supabase
		.from('users')
		.update({
			email: primaryEmail,
			full_name: fullName,
			avatar_url: userData.image_url || null,
			updated_at: new Date().toISOString(),
		})
		.eq('clerk_user_id', userData.id)

	if (error) {
		console.error('Error updating user in Supabase:', error)
		throw error
	}

	console.log(`Successfully updated user ${userData.id} in Supabase`)
}

async function handleUserDeleted(userData: ClerkWebhookEvent['data']) {
	// Delete user from Supabase (cascade will handle related records)
	const { error } = await supabase.from('users').delete().eq('clerk_user_id', userData.id)

	if (error) {
		console.error('Error deleting user from Supabase:', error)
		throw error
	}

	console.log(`Successfully deleted user ${userData.id} from Supabase`)
}
