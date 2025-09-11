import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { ThemedView } from "@components/ThemedView";
import { useColorScheme } from "@lib/providers/ThemeProvider";
import {
    ActivityType,
    ActivityTypeId,
    getActivityTypesByCategory,
    getAllActivityTypes,
    getPopularActivityTypes,
} from "@repo/core";

interface ActivityTypeCategory {
  title: string;
  types: ActivityType[];
}

export default function SelectActivityTypeModal() {
  const { isDarkColorScheme } = useColorScheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("popular");

  const allActivityTypes = getAllActivityTypes();
  const popularActivityTypes = getPopularActivityTypes();

  const categories = useMemo((): ActivityTypeCategory[] => {
    const categoryMap: Record<string, ActivityType[]> = {
      popular: popularActivityTypes,
      cycling: getActivityTypesByCategory("cycling"),
      running: getActivityTypesByCategory("running"),
      swimming: getActivityTypesByCategory("swimming"),
      walking: getActivityTypesByCategory("walking"),
      strength: getActivityTypesByCategory("strength"),
      other: getActivityTypesByCategory("other"),
    };

    return Object.entries(categoryMap)
      .map(([key, types]) => ({
        title: key === "popular" ? "Popular" : key.charAt(0).toUpperCase() + key.slice(1),
        types: types.filter(type =>
          type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          type.description.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      }))
      .filter(category => category.types.length > 0);
  }, [searchQuery, popularActivityTypes]);

  const filteredTypes = useMemo(() => {
    if (!searchQuery) return [];

    return allActivityTypes.filter(type =>
      type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      type.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, allActivityTypes]);

  const handleClose = useCallback(() => {
    console.log("🏃 [DEBUG] Activity type selection modal closed");
    router.back();
  }, []);

  const handleSelectActivityType = useCallback((activityTypeId: ActivityTypeId) => {
    console.log("🏃 [DEBUG] Selected activity type:", activityTypeId);
    // Navigate back to record screen with activity type selection
    router.replace({
      pathname: "/(session)/record",
      params: {
        startRecording: "true",
        activityType: activityTypeId
      },
    });
  }, []);

  const renderActivityType = ({ item }: { item: ActivityType }) => {
    const iconColor = item.displayConfig.primaryColor;

    return (
      <TouchableOpacity
        style={[
          styles.activityItem,
          { backgroundColor: isDarkColorScheme ? "#1f1f1f" : "#ffffff" },
        ]}
        onPress={() => handleSelectActivityType(item.id)}
      >
        <View style={styles.activityIconContainer}>
          <View
            style={[
              styles.activityIcon,
              { backgroundColor: `${iconColor}20` },
            ]}
          >
            <Text style={styles.activityEmoji}>{item.displayConfig.emoji}</Text>
          </View>
        </View>

        <View style={styles.activityContent}>
          <View style={styles.activityHeader}>
            <Text
              style={[
                styles.activityName,
                { color: isDarkColorScheme ? "#ffffff" : "#000000" },
              ]}
            >
              {item.name}
            </Text>
            <View style={[styles.environmentBadge, { backgroundColor: getEnvironmentColor(item.environment) }]}>
              <Text style={styles.environmentText}>
                {item.environment.charAt(0).toUpperCase() + item.environment.slice(1)}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.activityDescription,
              { color: isDarkColorScheme ? "#cccccc" : "#666666" },
            ]}
          >
            {item.description}
          </Text>

          <View style={styles.constraintsContainer}>
            {item.recordingConstraints.requiresGPS && (
              <View style={[styles.constraintBadge, { backgroundColor: "#10b981" }]}>
                <Ionicons name="location" size={12} color="#ffffff" />
                <Text style={styles.constraintText}>GPS Required</Text>
              </View>
            )}
            {item.recordingConstraints.recommendsHeartRate && (
              <View style={[styles.constraintBadge, { backgroundColor: "#ef4444" }]}>
                <Ionicons name="heart" size={12} color="#ffffff" />
                <Text style={styles.constraintText}>HR Recommended</Text>
              </View>
            )}
            {item.recordingConstraints.supportsPower && (
              <View style={[styles.constraintBadge, { backgroundColor: "#f59e0b" }]}>
                <Ionicons name="flash" size={12} color="#ffffff" />
                <Text style={styles.constraintText}>Power Support</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.selectIndicator}>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={isDarkColorScheme ? "#666666" : "#cccccc"}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategory = ({ item }: { item: ActivityTypeCategory }) => (
    <View style={styles.categorySection}>
      <Text
        style={[
          styles.categoryTitle,
          { color: isDarkColorScheme ? "#ffffff" : "#000000" },
        ]}
      >
        {item.title}
      </Text>
      {item.types.map((type) => (
        <View key={type.id}>
          {renderActivityType({ item: type })}
        </View>
      ))}
    </View>
  );

  const getEnvironmentColor = (environment: string): string => {
    switch (environment) {
      case "outdoor":
        return "#10b981";
      case "indoor":
        return "#6366f1";
      case "water":
        return "#0ea5e9";
      case "mixed":
        return "#8b5cf6";
      default:
        return "#6b7280";
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: isDarkColorScheme ? "#333333" : "#e5e5e5",
          },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { color: isDarkColorScheme ? "#ffffff" : "#000000" },
          ]}
        >
          Select Activity Type
        </Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Ionicons
            name="close"
            size={24}
            color={isDarkColorScheme ? "#ffffff" : "#000000"}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDarkColorScheme ? "#2d2d2d" : "#f5f5f5",
              borderColor: isDarkColorScheme ? "#404040" : "#e5e5e5",
            },
          ]}
        >
          <Ionicons
            name="search"
            size={20}
            color={isDarkColorScheme ? "#666666" : "#999999"}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: isDarkColorScheme ? "#ffffff" : "#000000" },
            ]}
            placeholder="Search activity types..."
            placeholderTextColor={isDarkColorScheme ? "#666666" : "#999999"}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={isDarkColorScheme ? "#666666" : "#999999"}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {searchQuery.length > 0 ? (
        // Search Results
        <FlatList
          data={filteredTypes}
          renderItem={renderActivityType}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        // Categories
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.title}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    marginRight: 8,
  },
  listContainer: {
    padding: 16,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activityIconContainer: {
    marginRight: 12,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  activityEmoji: {
    fontSize: 24,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  environmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  environmentText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  activityDescription: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 8,
  },
  constraintsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  constraintBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  constraintText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ffffff",
    marginLeft: 4,
  },
  selectIndicator: {
    marginLeft: 8,
  },
});
