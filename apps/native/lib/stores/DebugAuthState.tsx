import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from './auth-store';

export const DebugAuthState: React.FC = () => {
  const authState = useAuthStore();

  useEffect(() => {
    console.log('🐛 DebugAuthState: Component mounted');
    console.log('🐛 DebugAuthState: Current state:', {
      session: !!authState.session,
      user: !!authState.user,
      loading: authState.loading,
      initialized: authState.initialized,
      hydrated: authState.hydrated,
      isAuthenticated: authState.isAuthenticated,
    });
  }, [authState]);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🐛 Auth Store Debug</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>State Properties:</Text>
        <Text style={styles.item}>Session: {authState.session ? '✅ Present' : '❌ Null'}</Text>
        <Text style={styles.item}>User: {authState.user ? '✅ Present' : '❌ Null'}</Text>
        <Text style={styles.item}>Loading: {authState.loading ? '⏳ True' : '✅ False'}</Text>
        <Text style={styles.item}>Initialized: {authState.initialized ? '✅ True' : '❌ False'}</Text>
        <Text style={styles.item}>Hydrated: {authState.hydrated ? '✅ True' : '❌ False'}</Text>
        <Text style={styles.item}>Is Authenticated: {authState.isAuthenticated ? '✅ True' : '❌ False'}</Text>
      </View>

      {authState.user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Details:</Text>
          <Text style={styles.item}>Email: {authState.user.email || 'N/A'}</Text>
          <Text style={styles.item}>ID: {authState.user.id || 'N/A'}</Text>
          <Text style={styles.item}>Email Confirmed: {authState.user.email_confirmed_at ? '✅ Yes' : '❌ No'}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Computed States:</Text>
        <Text style={styles.item}>Ready for Navigation: {
          authState.initialized && authState.hydrated && !authState.loading ? '✅ Yes' : '❌ No'
        }</Text>
        <Text style={styles.item}>Should Show Internal: {authState.isAuthenticated ? '✅ Yes' : '❌ No'}</Text>
        <Text style={styles.item}>Should Show External: {!authState.isAuthenticated ? '✅ Yes' : '❌ No'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Troubleshooting:</Text>
        <Text style={styles.troubleshoot}>
          {!authState.hydrated && 'Waiting for store hydration...'}
          {authState.hydrated && !authState.initialized && 'Store hydrated but not initialized'}
          {authState.initialized && authState.loading && 'Initialized but still loading'}
          {authState.initialized && !authState.loading && !authState.session && 'No active session'}
          {authState.session && !authState.isAuthenticated && 'Session exists but not authenticated (email not verified?)'}
          {authState.isAuthenticated && 'All good! User is authenticated'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#555',
  },
  item: {
    fontSize: 16,
    marginBottom: 5,
    color: '#666',
    fontFamily: 'monospace',
  },
  troubleshoot: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
