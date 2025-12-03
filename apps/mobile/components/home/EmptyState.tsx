import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Target } from "lucide-react-native";

interface EmptyStateProps {
  onCreatePlan: () => void;
}

export function EmptyState({ onCreatePlan }: EmptyStateProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6 items-center">
        <Icon as={Target} size={48} className="text-muted-foreground mb-4" />
        <Text className="text-foreground text-lg font-bold text-center mb-2">
          Welcome to GradientPeak!
        </Text>
        <Text className="text-muted-foreground text-sm text-center mb-4">
          Start by creating your first training plan to unlock personalized
          insights and track your progress.
        </Text>
        <Button onPress={onCreatePlan} className="bg-primary">
          <Text className="text-primary-foreground font-semibold">
            Create Training Plan
          </Text>
        </Button>
      </CardContent>
    </Card>
  );
}
