import { useAuth } from '@/lib/contexts';
import { useColorScheme } from '@/lib/useColorScheme';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function RootIndex() {
  const { loading, isAuthenticated } = useAuth();
  const { isDarkColorScheme } = useColorScheme();

  // Show loading while determining auth state
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isDarkColorScheme ? '#000000' : '#ffffff',
        }}
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? '#ffffff' : '#000000'}
        />
      </View>
    );
  }

  // Redirect based on authentication state
  if (isAuthenticated) {
    return <Redirect href="/(internal)" />;
  }

  return <Redirect href="/(external)/welcome" />;
}
