import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isClerkAPIResponseError, useSignUp } from '@clerk/clerk-expo'
import React from 'react'

const signUpSchema = z.object({
	email: z.email('Invalid email'),
	password: z
		.string({ message: 'Password is required' })
		.min(8, 'Password should be at least 8 characters long'),
})

type SignUpFields = z.infer<typeof signUpSchema>

const mapClerkErrorToFormField = (error: any) => {
	switch (error.meta?.paramName) {
		case 'email_address':
			return 'email'
		case 'password':
			return 'password'
		default:
			return 'root'
	}
}

export default function SignUpScreen() {
	const router = useRouter();
	const {
		control,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<SignUpFields>({
		resolver: zodResolver(signUpSchema),
	})

	const { signUp, isLoaded } = useSignUp()

	const onSignUp = async (data: SignUpFields) => {
		if (!isLoaded) return

		try {
			await signUp.create({
				emailAddress: data.email,
				password: data.password,
			})

			await signUp.prepareVerification({ strategy: 'email_code' })

			router.push('/verify')
		} catch (err) {
			console.log('Sign up error: ', err)
			if (isClerkAPIResponseError(err)) {
				err.errors.forEach((error) => {
					console.log('Error: ', JSON.stringify(error, null, 2))
					const fieldName = mapClerkErrorToFormField(error)
					console.log('Field name: ', fieldName)
					setError(fieldName, {
						message: error.longMessage,
					})
				})
			} else {
				setError('root', { message: 'Unknown error' })
			}
		}
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={styles.container}
		>
			<Text style={styles.title}>Create an account</Text>

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

			<Button onPress={handleSubmit(onSignUp)}>
				<Text>Sign Up</Text>
			</Button>

			<Button onPress={() => router.replace('/(auth)/sign-in')}>
				<Text>Already have an account? Sign in</Text>
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
