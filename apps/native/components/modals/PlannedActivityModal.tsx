import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import PlannedActivityService, {
    PlannedActivity,
} from "@lib/services/planned-activity-service";

interface PlannedActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (plannedActivityId: string) => void;
}

export const PlannedActivityModal: React.FC<PlannedActivityModalProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const [plannedActivities, setPlannedActivities] = useState<PlannedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  // Load planned activities
  useEffect(() => {
    if (visible) {
      loadPlannedActivities();
    }
  }, [visible]);

  const loadPlannedActivities = async () => {
    try {
      setLoading(true);
      const activities = await PlannedActivityService.getAllPlannedActivities();
      setPlannedActivities(activities);
    } catch (error) {
      console.error("Failed to load planned activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedActivity) {
      onSelect(selectedActivity);
    }
  };

  const getDifficultyColor = (difficulty: PlannedActivity["metadata"]["difficulty"]) => {
    switch (difficulty) {
      case "easy":
        return "#10b981";
      case "moderate":
        return "#f59e0b";
      case "hard":
        return "#ef4444";
      case "very_hard":
        return "#7c2d12";
      default:
        return "#6b7280";
    }
  };

  const getActivityTypeIcon = (type: PlannedActivity["activityType"]) => {
    switch (type) {
      case "cycling":
        return "bicycle";
      case "running":
        return "walk";
      case "swimming":
        return "water";
      default:
        return "fitness";
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatDistance = (meters?: number): string => {
    if (!meters) return "";
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const renderActivityItem = ({ item }: { item: PlannedActivity }) => {
    const isSelected = selectedActivity === item.id;

    return (
      <TouchableOpacity
        style={[styles.activityItem, isSelected && styles.activityItemSelected]}
        onPress={() => setSelectedActivity(item.id)}
      >
        <View style={styles.activityHeader}>
          <View style={styles.activityTitleContainer}>
            <Ionicons
              name={getActivityTypeIcon(item.activityType) as keyof typeof Ionicons.glyphMap}
              size={20}
              color="#3b82f6"
            />
            <Text style={styles.activityTitle}>{item.name}</Text>
          </View>

          <View
            style={[
              styles.difficultyBadge,
              { backgroundColor: getDifficultyColor(item.metadata.difficulty) + "20" },
            ]}
          >
            <Text
              style={[
                styles.difficultyText,
                { color: getDifficultyColor(item.metadata.difficulty) },
              ]}
            >
              {item.metadata.difficulty.toUpperCase()}
            </Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.activityDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.activityMetrics}>
          <View style={styles.metricItem}>
            <Ionicons name="time-outline" size={14} color="#6b7280" />
            <Text style={styles.metricText}>
              {formatDuration(item.estimatedDuration)}
            </Text>
          </View>

          {item.estimatedDistance && (
            <View style={styles.metricItem}>
              <Ionicons name="navigate-outline" size={14} color="#6b7280" />
              <Text style={styles.metricText}>
                {formatDistance(item.estimatedDistance)}
              </Text>
            </View>
          )}

          {item.estimatedTSS && (
            <View style={styles.metricItem}>
              <Ionicons name="flash-outline" size={14} color="#6b7280" />
              <Text style={styles.metricText}>{item.estimatedTSS} TSS</Text>
            </View>
          )}

          <View style={styles.metricItem}>
            <Ionicons name="list-outline" size={14} color="#6b7280" />
            <Text style={styles.metricText}>{item.steps.length} steps</Text>
          </View>
        </View>

        {item.metadata.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.metadata.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {item.metadata.tags.length > 3 && (
              <Text style={styles.moreTagsText}>
                +{item.metadata.tags.length - 3} more
              </Text>
            )}
          </View>
        )}

        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyStateTitle}>No Planned Activities</Text>
      <Text style={styles.emptyStateText}>
        Create structured workouts to guide your training sessions.
      </Text>
      <TouchableOpacity style={styles.createButton} onPress={onClose}>
        <Ionicons name="add" size={20} color="#ffffff" />
        <Text style={styles.createButtonText}>Create Activity</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Choose Planned Activity</Text>

          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading activities...</Text>
          </View>
        ) : plannedActivities.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            <FlatList
              data={plannedActivities}
              renderItem={renderActivityItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />

            {/* Action Buttons */}
            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  !selectedActivity && styles.selectButtonDisabled,
                ]}
                onPress={handleSelect}
                disabled={!selectedActivity}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    !selectedActivity && styles.selectButtonTextDisabled,
                  ]}
                >
                  Start Planned Activity
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.freeActivityButton}
                onPress={() => onSelect("")} // Empty string indicates free activity
              >
                <Text style={styles.freeActivityButtonText}>
                  Record Free Activity Instead
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  headerRight: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  listContent: {
    padding: 20,
    paddingBottom: 120, // Space for action buttons
  },
  activityItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  activityItemSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  activityTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
    flex: 1,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: "700",
  },
  activityDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 20,
  },
  activityMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  metricItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tag: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    color: "#3730a3",
    fontWeight: "500",
  },
  moreTagsText: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "500",
    alignSelf: "center",
  },
  selectedIndicator: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  actionContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  selectButton: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  selectButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  selectButtonTextDisabled: {
    color: "#d1d5db",
  },
  freeActivityButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  freeActivityButtonText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
});
