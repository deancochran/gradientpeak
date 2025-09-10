import { useColorScheme } from "@lib/providers/ThemeProvider";
import * as Linking from "expo-linking";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getDynamicAppConfig } from "../app.config";

interface ConfigInfo {
  key: string;
  value: string | undefined;
  isValid: boolean;
}

export const DeepLinkDebugger: React.FC = () => {
  const { isDarkColorScheme } = useColorScheme();
  const [urlSchemeTest, setUrlSchemeTest] = React.useState<string>("");

  // Get current environment and configuration
  const environment =
    (process.env.APP_ENV as "development" | "preview" | "production") ||
    "development";
  const config = getDynamicAppConfig(environment);

  // Configuration checks
  const configChecks: ConfigInfo[] = [
    {
      key: "APP_ENV",
      value: process.env.APP_ENV,
      isValid: !!process.env.APP_ENV,
    },
    {
      key: "EXPO_PUBLIC_SUPABASE_URL",
      value: process.env.EXPO_PUBLIC_SUPABASE_URL ? "✓ Set" : "Not set",
      isValid: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
    },
    {
      key: "EXPO_PUBLIC_SUPABASE_KEY",
      value: process.env.EXPO_PUBLIC_SUPABASE_KEY ? "✓ Set" : "Not set",
      isValid: !!process.env.EXPO_PUBLIC_SUPABASE_KEY,
    },
    {
      key: "EXPO_PUBLIC_APP_URL",
      value: process.env.EXPO_PUBLIC_APP_URL,
      isValid: !!process.env.EXPO_PUBLIC_APP_URL,
    },
    {
      key: "Current Environment",
      value: environment,
      isValid: true,
    },
    {
      key: "App Scheme",
      value: config.scheme,
      isValid: !!config.scheme,
    },
    {
      key: "Bundle ID",
      value: config.bundleIdentifier,
      isValid: !!config.bundleIdentifier,
    },
  ];

  // Expected URLs for Supabase configuration
  const expectedUrls = [
    `${config.scheme}://auth/callback`,
    `${config.scheme}://auth/reset-password`,
  ];

  const testUrlScheme = async () => {
    try {
      const testUrl = `${config.scheme}://auth/callback?test=true`;
      const canOpen = await Linking.canOpenURL(testUrl);
      setUrlSchemeTest(
        canOpen ? "✅ URL scheme works" : "❌ URL scheme not registered",
      );
    } catch (error) {
      setUrlSchemeTest(`❌ Error testing URL scheme: ${error}`);
    }
  };

  React.useEffect(() => {
    testUrlScheme();
  }, []);

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const cardBackgroundColor = isDarkColorScheme ? "#111111" : "#f8f9fa";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const subtleColor = isDarkColorScheme ? "#999999" : "#666666";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";
  const successColor = "#10b981";
  const errorColor = "#ef4444";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={[styles.title, { color: textColor }]}>
        Deep Link Configuration Debug
      </Text>

      {/* Environment Variables */}
      <View
        style={[
          styles.section,
          { backgroundColor: cardBackgroundColor, borderColor },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          Environment Variables
        </Text>
        {configChecks.map((check, index) => (
          <View key={index} style={styles.configRow}>
            <Text style={[styles.configKey, { color: textColor }]}>
              {check.key}:
            </Text>
            <Text
              style={[
                styles.configValue,
                { color: check.isValid ? successColor : errorColor },
              ]}
            >
              {check.value || "Not set"}
            </Text>
          </View>
        ))}
      </View>

      {/* URL Scheme Test */}
      <View
        style={[
          styles.section,
          { backgroundColor: cardBackgroundColor, borderColor },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          URL Scheme Test
        </Text>
        <Text style={[styles.testResult, { color: textColor }]}>
          {urlSchemeTest}
        </Text>
        <TouchableOpacity
          style={[styles.button, { borderColor }]}
          onPress={testUrlScheme}
        >
          <Text style={[styles.buttonText, { color: textColor }]}>
            Test URL Scheme
          </Text>
        </TouchableOpacity>
      </View>

      {/* Expected Supabase URLs */}
      <View
        style={[
          styles.section,
          { backgroundColor: cardBackgroundColor, borderColor },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          Expected Supabase Redirect URLs
        </Text>
        <Text style={[styles.subtitle, { color: subtleColor }]}>
          Add these to your Supabase project dashboard:
        </Text>
        <Text style={[styles.subtitle, { color: subtleColor }]}>
          Authentication → URL Configuration → Redirect URLs
        </Text>
        {expectedUrls.map((url, index) => (
          <View key={index} style={styles.urlRow}>
            <Text style={[styles.urlText, { color: successColor }]}>{url}</Text>
          </View>
        ))}
      </View>

      {/* Debug Info */}
      <View
        style={[
          styles.section,
          { backgroundColor: cardBackgroundColor, borderColor },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          Debug Information
        </Text>
        <View style={styles.debugRow}>
          <Text style={[styles.debugLabel, { color: subtleColor }]}>
            Process ENV APP_ENV:
          </Text>
          <Text style={[styles.debugValue, { color: textColor }]}>
            {process.env.APP_ENV || "undefined"}
          </Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={[styles.debugLabel, { color: subtleColor }]}>
            Resolved Environment:
          </Text>
          <Text style={[styles.debugValue, { color: textColor }]}>
            {environment}
          </Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={[styles.debugLabel, { color: subtleColor }]}>
            Config Scheme:
          </Text>
          <Text style={[styles.debugValue, { color: textColor }]}>
            {config.scheme}
          </Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={[styles.debugLabel, { color: subtleColor }]}>
            Full Redirect URL:
          </Text>
          <Text style={[styles.debugValue, { color: textColor }]}>
            {config.scheme}://auth/callback
          </Text>
        </View>
      </View>

      {/* Instructions */}
      <View
        style={[
          styles.section,
          { backgroundColor: cardBackgroundColor, borderColor },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          Quick Fix Instructions
        </Text>
        <Text style={[styles.instruction, { color: subtleColor }]}>
          1. Ensure your .env.local file has APP_ENV=development
        </Text>
        <Text style={[styles.instruction, { color: subtleColor }]}>
          2. Add the URLs above to your Supabase dashboard
        </Text>
        <Text style={[styles.instruction, { color: subtleColor }]}>
          3. Restart your Expo development server
        </Text>
        <Text style={[styles.instruction, { color: subtleColor }]}>
          4. Test sign up again to get the mobile deep link
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  configKey: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  configValue: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  testResult: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  urlRow: {
    paddingVertical: 8,
  },
  urlText: {
    fontSize: 14,
    fontFamily: "monospace",
  },
  debugRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  debugLabel: {
    fontSize: 12,
    width: 120,
  },
  debugValue: {
    fontSize: 12,
    flex: 1,
    fontFamily: "monospace",
  },
  instruction: {
    fontSize: 14,
    marginBottom: 8,
    paddingLeft: 8,
  },
});

export default DeepLinkDebugger;
