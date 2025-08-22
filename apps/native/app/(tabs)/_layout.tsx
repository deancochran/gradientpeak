import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import React from 'react'
import { Platform } from 'react-native'

import { useColorScheme } from '@/hooks/useColorScheme'
import { useAuth } from '@clerk/clerk-expo'

// function TabBarHeader() {
// 	return (
// 		<View style={{
// 		flexDirection: 'row',
// 		alignItems: 'center',
// 		justifyContent: 'space-between',
// 	}}>
// 			<View >
// 				<TouchableOpacity onPress={() => {}}>
// 					<Ionicons name="notifications-outline" size={24} color="#374151" />
// 				</TouchableOpacity>

// 				<TouchableOpacity onPress={() => {}}>
// 					<Ionicons name="calendar-outline" size={24}  />
// 				</TouchableOpacity>
// 			</View>
// 		</View>
// 	)
// }

export default function TabLayout() {
	const colorScheme = useColorScheme()
	const { isLoaded, isSignedIn } = useAuth()

	// Wait until Clerk finishes loading
	if (!isLoaded) {
		return null
	}

	// If user is not signed in, redirect to the sign-in flow
	if (!isSignedIn) {
		return <Redirect href="/welcome" />
	}

	return (
		<Tabs
			screenOptions={{
				// header: () => <TabBarHeader />,
        headerShown: false,
        tabBarShowLabel: false,
				tabBarStyle: Platform.select({
          default: { alignItems: "center", justifyContent: "center", height: 0, backgroundColor: 'white'  },

				}),
				tabBarItemStyle: {
					alignItems: "center", // Center horizontally

				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Home',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="record"
				options={{
					title: 'Record',
          
					tabBarIcon: ({ color, focused }) => (
						<Ionicons
							name={focused ? 'add-circle' : 'add-circle-outline'}
							size={24}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: 'Settings',
					tabBarIcon: ({ color, focused }) => (
						<Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
					),
				}}
			/>
		</Tabs>
	)
}

