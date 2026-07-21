import { createFileRoute } from "@tanstack/react-router";

import { TrainingPreferencesEditor } from "../../components/training-plan/training-preferences-editor";

export const Route = createFileRoute("/_protected/training-preferences")({
  component: TrainingPreferencesEditor,
});
