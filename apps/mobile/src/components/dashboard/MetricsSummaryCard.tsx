import React from 'react';
import { View, ScrollView } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import {
  Clock,
  MapPin,
  Heart,
  Zap,
  Activity,
  TrendingUp,
  Target,
  Flame,
  Timer,
  Navigation
} from 'lucide-react-native';
import { useMetricsSummary } from '@/lib/hooks/useLiveMetrics';
import { ActivityRecorderService } from '@/lib/services/ActivityRecorder';
import { formatDuration } from '@repo/core';

interface MetricsSummaryCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
  isRecording: boolean;
}

export const MetricsSummaryCard: React.FC<MetricsSummaryCardProps> = ({
  service,
  screenWidth,
  isRecording
}) => {
  const summary = useMetricsSummary(service);

  if (!summary) {
    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-6 flex-1 items-center justify-center">
            <Icon as={Activity} size={48} className="text-muted-foreground/20 mb-4" />
            <Text className="text-muted-foreground text-center">
              {isRecording ? 'Building metrics...' : 'Ready to start recording'}
            </Text>
            <Text className="text-sm text-muted-foreground/70 text-center mt-2">
              {isRecording ? 'Data will appear as sensors connect' : 'Select your activity type and press Start'}
            </Text>
          </CardContent>
        </Card>
      </View>
    );
  }

  const MetricTile = ({
    icon: IconComponent,
    label,
    value,
    unit,
    color = "text-foreground",
    bgColor = "bg-muted/10",
    iconColor = "text-muted-foreground"
  }: {
    icon: any;
    label: string;
    value: string | number;
    unit?: string;
    color?: string;
    bgColor?: string;
    iconColor?: string;
  }) => (
    <View className={`flex-1 p-3 rounded-lg ${bgColor}`}>
      <View className="flex-row items-center mb-2">
        <Icon as={IconComponent} size={16} className={`${iconColor} mr-2`} />
        <Text className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </Text>
      </View>
      <View className="flex-row items-baseline">
        <Text className={`text-xl font-bold ${color}`}>{value}</Text>
        {unit && (
          <Text className="text-sm text-muted-foreground ml-1">{unit}</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Activity} size={24} className="text-primary mr-2" />
              <Text className="text-lg font-semibold">Overview</Text>
            </View>
            {isRecording && (
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                <Text className="text-xs text-muted-foreground">RECORDING</Text>
              </View>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Primary Metrics - Large Display */}
            <View className="mb-6">
              <Text className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
                Primary Metrics
              </Text>

              {/* Time - Most Important */}
              <View className="items-center mb-6 p-4 bg-primary/10 rounded-lg">
                <Icon as={Clock} size={32} className="text-primary mb-2" />
                <Text className="text-4xl font-bold text-primary">
                  {formatDuration(summary.primary.elapsedTime)}
                </Text>
                <Text className="text-sm text-muted-foreground">Duration</Text>
              </View>

              {/* Key metrics grid */}
              <View className="flex-row gap-3 mb-4">
                <MetricTile
                  icon={MapPin}
                  label="Distance"
                  value={summary.primary.distance > 0 ? (summary.primary.distance / 1000).toFixed(1) : '0'}
                  unit="km"
                  color="text-green-600"
                  bgColor="bg-green-500/10"
                  iconColor="text-green-500"
                />
                <MetricTile
                  icon={Heart}
                  label="Avg HR"
                  value={summary.primary.avgHeartRate > 0 ? Math.round(summary.primary.avgHeartRate) : '--'}
                  unit={summary.primary.avgHeartRate > 0 ? "bpm" : undefined}
                  color="text-red-600"
                  bgColor="bg-red-500/10"
                  iconColor="text-red-500"
                />
              </View>

              <View className="flex-row gap-3">
                <MetricTile
                  icon={Zap}
                  label="Avg Power"
                  value={summary.primary.avgPower > 0 ? Math.round(summary.primary.avgPower) : '--'}
                  unit={summary.primary.avgPower > 0 ? "W" : undefined}
                  color="text-yellow-600"
                  bgColor="bg-yellow-500/10"
                  iconColor="text-yellow-500"
                />
                <MetricTile
                  icon={Flame}
                  label="Calories"
                  value={summary.secondary.calories}
                  unit="kcal"
                  color="text-orange-600"
                  bgColor="bg-orange-500/10"
                  iconColor="text-orange-500"
                />
              </View>
            </View>

            {/* Performance Metrics */}
            <View className="mb-6">
              <Text className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
                Performance
              </Text>

              <View className="flex-row gap-3 mb-4">
                <MetricTile
                  icon={TrendingUp}
                  label="Max HR"
                  value={summary.secondary.maxHeartRate > 0 ? summary.secondary.maxHeartRate : '--'}
                  unit={summary.secondary.maxHeartRate > 0 ? "bpm" : undefined}
                  color="text-red-500"
                />
                <MetricTile
                  icon={Zap}
                  label="Max Power"
                  value={summary.secondary.maxPower > 0 ? summary.secondary.maxPower : '--'}
                  unit={summary.secondary.maxPower > 0 ? "W" : undefined}
                  color="text-yellow-500"
                />
              </View>

              <View className="flex-row gap-3">
                <MetricTile
                  icon={Navigation}
                  label="Avg Speed"
                  value={summary.secondary.avgSpeed > 0 ? (summary.secondary.avgSpeed * 3.6).toFixed(1) : '--'}
                  unit={summary.secondary.avgSpeed > 0 ? "km/h" : undefined}
                  color="text-blue-500"
                />
                <MetricTile
                  icon={Timer}
                  label="Pace"
                  value={summary.secondary.avgSpeed > 0 ?
                    `${Math.floor(1000 / (summary.secondary.avgSpeed * 60))}:${
                      Math.round((1000 / (summary.secondary.avgSpeed * 60) % 1) * 60).toString().padStart(2, '0')
                    }` : '--:--'
                  }
                  unit={summary.secondary.avgSpeed > 0 ? "/km" : undefined}
                  color="text-purple-500"
                />
              </View>
            </View>

            {/* Training Analysis */}
            {(summary.analysis.tss > 0 || summary.analysis.normalizedPower > 0) && (
              <View className="mb-6">
                <Text className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
                  Training Analysis
                </Text>

                {/* TSS - Featured metric */}
                {summary.analysis.tss > 0 && (
                  <View className="p-4 bg-blue-500/10 rounded-lg mb-4">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-xs text-muted-foreground mb-1">Training Stress Score</Text>
                        <Text className="text-3xl font-bold text-blue-600">
                          {Math.round(summary.analysis.tss)}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {summary.analysis.tss < 50 ? 'Light session' :
                           summary.analysis.tss < 100 ? 'Moderate session' :
                           summary.analysis.tss < 150 ? 'Hard session' : 'Very hard session'}
                        </Text>
                      </View>
                      <Icon as={Target} size={32} className="text-blue-500" />
                    </View>
                  </View>
                )}

                <View className="flex-row gap-3">
                  {summary.analysis.normalizedPower > 0 && (
                    <MetricTile
                      icon={Zap}
                      label="Norm Power"
                      value={Math.round(summary.analysis.normalizedPower)}
                      unit="W"
                      color="text-orange-600"
                      bgColor="bg-orange-500/10"
                      iconColor="text-orange-500"
                    />
                  )}
                  {summary.analysis.intensityFactor > 0 && (
                    <MetricTile
                      icon={TrendingUp}
                      label="Intensity"
                      value={summary.analysis.intensityFactor.toFixed(2)}
                      color="text-purple-600"
                      bgColor="bg-purple-500/10"
                      iconColor="text-purple-500"
                    />
                  )}
                </View>
              </View>
            )}

            {/* Plan Adherence */}
            {summary.analysis.adherence > 0 && (
              <View className="p-4 bg-green-500/10 rounded-lg">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Icon as={Target} size={20} className="text-green-500 mr-2" />
                    <Text className="text-sm font-medium">Plan Adherence</Text>
                  </View>
                  <Text className="text-xs text-muted-foreground">Current Step</Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-3xl font-bold text-green-500">
                    {Math.round(summary.analysis.adherence * 100)}%
                  </Text>

                  {/* Progress bar */}
                  <View className="flex-1 ml-4">
                    <View className="h-3 bg-muted rounded-full overflow-hidden">
                      <View
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${Math.min(100, summary.analysis.adherence * 100)}%` }}
                      />
                    </View>
                  </View>
                </View>

                <Text className="text-xs text-muted-foreground mt-2">
                  {summary.analysis.adherence >= 0.9 ? 'Excellent execution' :
                   summary.analysis.adherence >= 0.8 ? 'Good execution' :
                   summary.analysis.adherence >= 0.7 ? 'Fair execution' : 'Focus on targets'}
                </Text>
              </View>
            )}

            {/* Footer info */}
            <View className="mt-6 pt-4 border-t border-muted/20">
              <Text className="text-xs text-muted-foreground text-center">
                {isRecording ?
                  'Metrics update every second during recording' :
                  'Start recording to see live metrics'
                }
              </Text>
            </View>
          </ScrollView>
        </CardContent>
      </Card>
    </View>
  );
};
