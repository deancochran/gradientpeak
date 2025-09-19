# TurboFit Mobile App — Record Page Update (Stepper Flow)

## 🎯 Purpose

The **Record** page guides the user through a **stepper flow** to prepare for either a **planned** or **unplanned** activity.
The stepper ensures all required context, permissions, and devices are ready before the activity begins.

---

## 🪜 Stepper Flow

### **Step 1: Choose Activity Type**

* **Planned Activity**

  * Select a **Profile Plan (Training Plan)**.
  * Select a **Planned Activity** within that plan.

    * Each planned activity has an associated **activity type** (e.g., run, cycle, strength).
* **Unplanned Activity**

  * Select an **Activity Type** directly (no plan/routine required).

---

### **Step 2: Enable Bluetooth (Conditional)**

* If the selected activity requires external metrics (e.g., power, cadence, HR):

  * Prompt user to **enable Bluetooth** and pair necessary devices.
* If not required, skip this step.

---

### **Step 3: Enable Permissions**

* Prompt user to allow:

  * **Location Access** (for GPS tracking).
  * **Background Location Access** (for continuous outdoor tracking).
* Show OS-native dialogs if permissions aren’t already granted.

---

### **Step 4: Confirmation**

* Display a **summary of selections**, including:

  * Planned/Unplanned activity choice.
  * Activity type.
  * Connected devices (if applicable).
  * Location/permissions status.
* Allow user to **navigate back to previous steps** to make changes.
* Final button: **“Begin Activity”**.

---

## 🎬 Transition to Recording

* When user presses **“Begin Activity”**:

  1. `recordingStore.status` is set to `"recording"`.
  2. App navigates to the **/recording** page.
  3. On the recording page, the user presses **“Start”** to actually begin metrics capture and time tracking.

This ensures:

* Activities don’t start automatically just by finishing the prep flow.
* User has a clear moment of control to begin recording.

---

## 🗄️ Recording State Shape (Zustand)

```ts
interface RecordingState {
  status: "idle" | "preparing" | "recording" | "paused" | "completed";
  mode: "planned" | "unplanned";
  userPlanId?: string;
  plannedActivityId?: string;
  activityType?: string;
  sensors: {
    bluetoothEnabled: boolean;
    devices: string[]; // paired sensor IDs
  };
  permissions: {
    location: boolean;
    backgroundLocation: boolean;
  };
}
```

---

## ✅ Benefits

* Handles both **planned** and **unplanned** flows with a unified stepper.
* Ensures **critical setup** (sensors + permissions) before recording begins.
* Provides a **final confirmation** step to reduce user error.
* Keeps recording resilient and **decoupled from setup UI**.
