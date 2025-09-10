import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  hasPermissions: boolean;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  isPaused,
  onStart,
  onStop,
  onPause,
  onResume,
  hasPermissions,
}) => {
  // Show initial state when not recording
  if (!isRecording && !isPaused) {
    return (
      <View style={styles.footerInitial}>
        <TouchableOpacity
          style={[
            styles.startButton,
            !hasPermissions && styles.startButtonDisabled,
          ]}
          onPress={onStart}
          disabled={!hasPermissions}
        >
          <Text style={styles.startButtonText}>
            {hasPermissions ? "Start Activity" : "Permissions Required"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show recording controls when active or paused
  return (
    <View style={styles.footerRecording}>
      <TouchableOpacity style={styles.stopButton} onPress={onStop}>
        <Ionicons name="stop-circle-outline" size={28} color="#ef4444" />
        <Text style={styles.stopButtonText}>Stop</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.mainActionButton, isPaused && styles.pausedButton]}
        onPress={isPaused ? onResume : onPause}
      >
        <Ionicons
          name={isPaused ? "play-circle" : "pause-circle"}
          size={80}
          color={isPaused ? "#10b981" : "#111827"}
        />
      </TouchableOpacity>

      {isPaused && (
        <View style={styles.pausedIndicator}>
          <Text style={styles.pausedText}>Activity Paused</Text>
        </View>
      )}

      {/* Spacer for layout balance */}
      <View style={{ width: 60 }} />
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
  stopButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
  },
  stopButtonText: {
    fontSize: 12,
    color: "#ef4444",
    fontWeight: "500",
    marginTop: 4,
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
  pausedButton: {
    opacity: 0.9,
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
});
