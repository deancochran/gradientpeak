import { Link, useRouter } from 'expo-router'

import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isClerkAPIResponseError, useSignIn } from '@clerk/clerk-expo'

const signInSchema = z.object({
	email: z.email('Invalid email'),
	password: z
		.string({ message: 'Password is required' })
		.min(8, 'Password should be at least 8 characters long'),
})

type SignInFields = z.infer<typeof signInSchema>

const mapClerkErrorToFormField = (error: any) => {
	switch (error.meta?.paramName) {
		case 'identifier':
			return 'email'
		case 'password':
			return 'password'
		default:
			return 'root'
	}
}

export default function SignInScreen() {
	const router = useRouter();
	const {
		control,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<SignInFields>({
		resolver: zodResolver(signInSchema),
	})

	console.log('Errors: ', JSON.stringify(errors, null, 2))

	const { signIn, isLoaded, setActive } = useSignIn()

	const onSignIn = async (data: SignInFields) => {
		if (!isLoaded) return

		try {
			const signInAttempt = await signIn.create({
				identifier: data.email,
				password: data.password,
			})

			if (signInAttempt.status === 'complete') {
				setActive({ session: signInAttempt.createdSessionId })
			} else {
				console.log('Sign in failed')
				setError('root', { message: 'Sign in could not be completed' })
			}
		} catch (err) {
			console.log('Sign in error: ', JSON.stringify(err, null, 2))

			if (isClerkAPIResponseError(err)) {
				err.errors.forEach((error) => {
					const fieldName = mapClerkErrorToFormField(error)
					setError(fieldName, {
						message: error.longMessage,
					})
				})
			} else {
				setError('root', { message: 'Unknown error' })
			}
		}

		console.log('Sign in: ', data.email, data.password)
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={styles.container}
		>
			<Text style={styles.title}>Sign in</Text>

			<View style={styles.form}>
				<Controller
					control={control}
					name="email"
					render={({ field: { onChange, value } }) => (
						<Input
							placeholder="Email"
							value={value}
							onChangeText={onChange}
							autoFocus
							autoCapitalize="none"
							keyboardType="email-address"
							autoComplete="email"
						/>
					)}
				/>

				<Controller
					control={control}
					name="password"
					render={({ field: { onChange, value } }) => (
						<Input placeholder="Password" value={value} onChangeText={onChange} secureTextEntry />
					)}
				/>

				{errors.root && <Text style={{ color: 'crimson' }}>{errors.root.message}</Text>}
			</View>

			<Button onPress={handleSubmit(onSignIn)}>
				<Text>Sign In</Text>
			</Button>

			<Link href="/sign-up" style={styles.link}>
				
			</Link>
			<Button onPress={() => router.replace('/(auth)/sign-up')}>
				<Text>Don't have an account? Sign up</Text>
			</Button>

			{/* <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 'auto' }}>
        <SignInWith strategy='oauth_google' />
        <SignInWith strategy='oauth_facebook' />
        <SignInWith strategy='oauth_apple' />
      </View> */}
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#fff',
		justifyContent: 'center',
		padding: 20,
		gap: 20,
	},
	form: {
		gap: 5,
	},
	title: {
		fontSize: 24,
		fontWeight: '600',
	},
	link: {
		color: '#4353FD',
		fontWeight: '600',
	},
})
