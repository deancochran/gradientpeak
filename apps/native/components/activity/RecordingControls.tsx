import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  onStart: () => void;
  onFinish: () => void;
  onPause: () => void;
  onResume: () => void;
  onDiscard: () => void;
  hasPermissions: boolean;
  isLoading?: boolean;
  plannedActivity?: boolean;
  onAdvanceStep?: () => void;
  onSkipStep?: () => void;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  isPaused,
  onStart,
  onFinish,
  onPause,
  onResume,
  onDiscard,
  hasPermissions,
  isLoading = false,
  plannedActivity = false,
  onAdvanceStep,
  onSkipStep,
}) => {
  // Show initial state when not recording
  if (!isRecording && !isPaused) {
    return (
      <View style={styles.footerInitial}>
        <TouchableOpacity
          style={[
            styles.startButton,
            (!hasPermissions || isLoading) && styles.startButtonDisabled,
          ]}
          onPress={onStart}
          disabled={!hasPermissions || isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.startButtonText}>Completing Activity...</Text>
            </View>
          ) : (
            <Text style={styles.startButtonText}>
              {hasPermissions ? "Start Activity" : "Permissions Required"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Show recording controls when active or paused
  return (
    <View style={styles.footerRecording}>
      {/* Left side - Actions available when paused */}
      {isPaused ? (
        <View style={styles.pausedActions}>
          <TouchableOpacity
            style={[styles.actionButton, isLoading && styles.buttonDisabled]}
            onPress={onDiscard}
            disabled={isLoading}
          >
            <Ionicons name="trash-outline" size={28} color="#ef4444" />
            <Text style={styles.discardButtonText}>Discard</Text>
          </TouchableOpacity>
        </View>
      ) : plannedActivity && !isLoading ? (
        // Planned activity controls when recording
        <View style={styles.plannedActions}>
          {onAdvanceStep && (
            <TouchableOpacity style={styles.stepButton} onPress={onAdvanceStep}>
              <Ionicons
                name="checkmark-circle-outline"
                size={24}
                color="#10b981"
              />
              <Text style={styles.stepButtonText}>Complete Step</Text>
            </TouchableOpacity>
          )}

          {onSkipStep && (
            <TouchableOpacity style={styles.stepButton} onPress={onSkipStep}>
              <Ionicons
                name="play-skip-forward-outline"
                size={24}
                color="#f59e0b"
              />
              <Text style={styles.stepButtonText}>Skip Step</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // Spacer when recording actively to maintain layout
        <View style={styles.spacer} />
      )}

      {/* Center - Main action button */}
      {isRecording && !isPaused ? (
        // Only show pause when actively recording
        <TouchableOpacity
          style={[styles.mainActionButton, isLoading && styles.buttonDisabled]}
          onPress={onPause}
          disabled={isLoading}
        >
          <Ionicons name="pause-circle" size={80} color="#111827" />
        </TouchableOpacity>
      ) : isPaused ? (
        // Show resume when paused
        <TouchableOpacity
          style={[styles.mainActionButton, isLoading && styles.buttonDisabled]}
          onPress={onResume}
          disabled={isLoading}
        >
          <Ionicons name="play-circle" size={80} color="#10b981" />
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      {/* Right side - Finish button only when paused */}
      {isPaused ? (
        <TouchableOpacity
          style={[styles.actionButton, isLoading && styles.buttonDisabled]}
          onPress={onFinish}
          disabled={isLoading}
        >
          <Ionicons name="checkmark-circle-outline" size={28} color="#10b981" />
          <Text style={styles.finishButtonText}>Finish</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}

      {/* Status indicators */}
      {isPaused && (
        <View style={styles.pausedIndicator}>
          <Text style={styles.pausedText}>Activity Paused</Text>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingIndicator}>
          <Text style={styles.loadingText}>Saving Activity...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  footerInitial: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  startButton: {
    backgroundColor: "#111827",
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonDisabled: {
    backgroundColor: "#9ca3af",
    shadowOpacity: 0.1,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  footerRecording: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    position: "relative",
  },
  pausedActions: {
    flexDirection: "column",
    alignItems: "center",
    width: 60,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  discardButtonText: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "500",
    marginTop: 4,
  },
  finishButtonText: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "500",
    marginTop: 4,
  },
  spacer: {
    width: 60,
  },
  mainActionButton: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  pausedIndicator: {
    position: "absolute",
    bottom: 90,
    left: "50%",
    transform: [{ translateX: -50 }],
    backgroundColor: "#f59e0b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pausedText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  plannedActions: {
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    width: 80,
  },
  stepButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  stepButtonText: {
    fontSize: 10,
    color: "#374151",
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  loadingIndicator: {
    position: "absolute",
    bottom: 90,
    left: "50%",
    transform: [{ translateX: -50 }],
    backgroundColor: "#3b82f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});
