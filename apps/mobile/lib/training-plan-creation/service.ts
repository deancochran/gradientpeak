import { trainingPlanBuilderReducer } from "./reducer";
import { selectBuilderSummary, selectSaveReadiness } from "./selectors";
import type { TrainingPlanBuilderAction, TrainingPlanBuilderState } from "./types";

type TrainingPlanBuilderSnapshot = ReturnType<TrainingPlanBuilderService["getSnapshot"]>;
type TrainingPlanBuilderSubscriber = (snapshot: TrainingPlanBuilderSnapshot) => void;

export class TrainingPlanBuilderService {
  private state: TrainingPlanBuilderState;
  private readonly subscribers = new Set<TrainingPlanBuilderSubscriber>();

  constructor(initialState: TrainingPlanBuilderState) {
    this.state = initialState;
  }

  getSnapshot() {
    return {
      state: this.state,
      summary: selectBuilderSummary(this.state),
      saveReadiness: selectSaveReadiness(this.state),
    };
  }

  subscribe(subscriber: TrainingPlanBuilderSubscriber) {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  dispatch(action: TrainingPlanBuilderAction) {
    this.state = trainingPlanBuilderReducer(this.state, action);
    const snapshot = this.getSnapshot();
    this.subscribers.forEach((subscriber) => {
      subscriber(snapshot);
    });
  }
}
