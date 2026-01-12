I like this document; however, the project name is GradientPeak, not chainlinksrm.
The transition from navigation to context summary feels unusual. There’s no need to justify the design specification.
Note: The Outdoor/Indoor activity location is a configuration that determines whether GPS is enabled or disabled. There’s no need to define decision logic for “outdoor + GPS unavailable” because this scenario never occurs. Either GPS is enabled and the activity location is outdoors, or the user is indoors without GPS.
Indoor activities can still display the map/route/card if a route is specified, allowing a GPX path to be available for the user to follow. As the user progresses, their indicator should move along the route, updating distance and speed to show activity progress. This is a virtual activity but tied to a route. The route’s grade should also update the FTMS machine as the user advances, unless manually changed.
When a route exists, a polyline should be generated so the user can visually track progress during the activity. Based on this and the provided information, the decision-rendering matrix needs to be adjusted to better align with my intentions.
The anchor description is good, but the user should be able to select the current category and/or location in the modal before starting. Once recording begins, the activity category/selection button and modal should disappear, leaving only recording controls visible.
The activity category/location selection button should appear above the footer. When the footer is expanded with the drag handle, it should cover the button unless collapsed again.
Footer behavior:

When not recording: show only the Start button.
When recording: show Pause and Lap buttons.
When paused: show Resume and Finish buttons.

Under the expanded footer sheet, the plan and route management modals should allow:

Removing the active plan/route
Switching to a different plan or route
Adding a plan or route to an activity that didn’t have one initially

Creating or editing a plan/route should not be part of this functionality.
Lastly, the FTMS adjustment option should open a modal with a horizontally scrollable tab list of all connected BLE FTMS machines, defaulting to the first available. This lets the user select a machine and make live adjustments (e.g., enable ERG mode, increase/decrease target metrics, etc.).
