import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Button } from "../ui/button";

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
  if (!isRecording) {
    return (
      <View style={styles.footerInitial}>
        <Button
          style={styles.startButton}
          onPress={onStart}
          disabled={!hasPermissions}
        >
          <Text style={styles.startButtonText}>Start Workout</Text>
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.footerRecording}>
      <TouchableOpacity style={styles.stopButton} onPress={onStop}>
        <Ionicons name="stop-circle-outline" size={28} color="#ef4444" />
        <Text style={styles.stopButtonText}>Stop</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.mainActionButton}
        onPress={isPaused ? onResume : onPause}
      >
        <Ionicons
          name={isPaused ? "play-circle" : "pause-circle"}
          size={80}
          color="#111827"
        />
      </TouchableOpacity>

      {/* Spacer for layout balance */}
      <View style={{ width: 60 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  footerInitial: {
    alignItems: "center",
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
  startButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  footerRecording: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  },
});
