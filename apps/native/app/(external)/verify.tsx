import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native'

import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isClerkAPIResponseError, useSignUp } from '@clerk/clerk-expo'

const verifySchema = z.object({
	code: z.string({ message: 'Code is required' }).length(6, 'Invalid code'),
})

type VerifyFields = z.infer<typeof verifySchema>

const mapClerkErrorToFormField = (error: any) => {
	switch (error.meta?.paramName) {
		case 'code':
			return 'code'
		default:
			return 'root'
	}
}

export default function VerifyScreen() {
	const {
		control,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<VerifyFields>({
		resolver: zodResolver(verifySchema),
	})

	const { signUp, isLoaded, setActive } = useSignUp()

	const onVerify = async ({ code }: VerifyFields) => {
		if (!isLoaded) return

		try {
			const signUpAttempt = await signUp.attemptEmailAddressVerification({
				code,
			})

			if (signUpAttempt.status === 'complete') {
				setActive({ session: signUpAttempt.createdSessionId })
			} else {
				console.log('Verification failed')
				console.log(signUpAttempt)
				setError('root', { message: 'Could not complete the sign up' })
			}
		} catch (err) {
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
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={styles.container}
		>
			<Text style={styles.title}>Verify your email</Text>

			<Controller
				control={control}
				name="code"
				render={({ field: { onChange, onBlur, value } }) => (
					<Input
						placeholder="123456"
						value={value}
						onChangeText={onChange}
						onBlur={onBlur}
						autoFocus
						autoCapitalize="none"
						keyboardType="number-pad"
						autoComplete="one-time-code"
					/>
				)}
			/>

			<Button onPress={handleSubmit(onVerify)} >
        <Text>Verify</Text>
      </Button>
		</KeyboardAvoidingView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
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
