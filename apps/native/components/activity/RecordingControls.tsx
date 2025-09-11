import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RecordingControlsProps {
  // Recording state
  isRecording: boolean;
  isPaused: boolean;

  // Selection state
  hasSelectedActivity: boolean;
  canStartRecording: boolean;

  // Control callbacks
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;

  // Loading states
  isStarting?: boolean;
  isCompleting?: boolean;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  isPaused,
  hasSelectedActivity,
  canStartRecording,
  onStart,
  onPause,
  onResume,
  onFinish,
  onDiscard,
  isStarting = false,
  isCompleting = false,
}) => {
  // Not recording and no activity selected - show disabled start
  if (!isRecording && !isPaused && !hasSelectedActivity) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.startButton, styles.disabledButton]}
          disabled={true}
        >
          <Text style={styles.disabledButtonText}>Select Activity First</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Activity selected but can't start recording (missing requirements)
  if (!isRecording && !isPaused && hasSelectedActivity && !canStartRecording) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.startButton, styles.disabledButton]}
          disabled={true}
        >
          <Text style={styles.disabledButtonText}>Requirements Not Met</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ready to start recording
  if (!isRecording && !isPaused && hasSelectedActivity && canStartRecording) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.startButton, isStarting && styles.loadingButton]}
          onPress={onStart}
          disabled={isStarting}
        >
          {isStarting ? (
            <Text style={styles.startButtonText}>Starting...</Text>
          ) : (
            <>
              <Ionicons name="play" size={20} color="#ffffff" />
              <Text style={styles.startButtonText}>Start Recording</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Currently recording (active)
  if (isRecording && !isPaused) {
    return (
      <View style={styles.container}>
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onPause}>
            <Ionicons name="pause" size={20} color="#374151" />
            <Text style={styles.secondaryButtonText}>Pause</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.finishButton, isCompleting && styles.loadingButton]}
            onPress={onFinish}
            disabled={isCompleting}
          >
            {isCompleting ? (
              <Text style={styles.finishButtonText}>Finishing...</Text>
            ) : (
              <>
                <Ionicons name="stop" size={20} color="#ffffff" />
                <Text style={styles.finishButtonText}>Finish</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Recording is paused
  if (isPaused) {
    return (
      <View style={styles.container}>
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.discardButton} onPress={onDiscard}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text style={styles.discardButtonText}>Discard</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
            <Ionicons name="play" size={20} color="#ffffff" />
            <Text style={styles.resumeButtonText}>Resume</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.finishButton, isCompleting && styles.loadingButton]}
            onPress={onFinish}
            disabled={isCompleting}
          >
            {isCompleting ? (
              <Text style={styles.finishButtonText}>Finishing...</Text>
            ) : (
              <>
                <Ionicons name="stop" size={20} color="#ffffff" />
                <Text style={styles.finishButtonText}>Finish</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },

  // Single button layouts
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },

  disabledButton: {
    backgroundColor: "#f3f4f6",
  },

  loadingButton: {
    opacity: 0.7,
  },

  startButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },

  disabledButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9ca3af",
  },

  // Multi-button layout
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    minWidth: 80,
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },

  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },

  resumeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  finishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },

  finishButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  discardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 4,
    minWidth: 80,
  },

  discardButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ef4444",
  },
});
