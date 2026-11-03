# Expo UI native foundation assessment

Mobile pins `@expo/ui` to **57.0.19**, the patch recommended by Expo's current SDK 57
compatibility service. It is app-owned infrastructure for evaluating native controls in
the next development binary. The activity-plan editor is not part of this prototype.

## Preview after rebuilding

1. Include this dependency in the next approved iOS/Android development build and install
   that binary. An older binary cannot gain the native module through Metro reloads.
2. From the repository root, using the pinned Node 24 runtime, run:

   ```sh
   pnpm --filter mobile storybook:generate
   pnpm --filter mobile storybook:start
   ```

3. Connect the development app to Metro and open the existing `/storybook` route
   (`gradientpeak-dev://storybook` for the development scheme).
4. Select **Inputs / NativePickerAssessment / Expo UI Foundation**. Compare it with
   **Inputs / NativePicker** in the same catalog.
5. Select Easy, Steady, and Hard. The native selection and React Native readout should
   agree, initially Steady. Check light/dark appearance, large text, VoiceOver/TalkBack,
   and repeated selection on both platforms before making any product adoption decision.

The scene uses local React state only, with no persistence or API calls. iOS imports a
SwiftUI `Host`/`Picker`; Android imports a Compose `Host`/`SingleChoiceSegmentedButtonRow`.
Metro resolves platform-specific files. The generic/web fallback imports no Expo UI.
The Storybook config registers the app-owned story; Knip explicitly includes the story
and native platform implementations because its generic resolver selects the fallback.

## Native prerequisites and rebuild boundary

- SDK 57 documents iOS **16.4+**, **Xcode 26.4+**, Android **7+ / API 24+**, and compile/
  target SDK **36**. Expo UI's podspec also declares iOS 16.4 and Swift 5.9; the existing
  ExpoModulesCore requires Swift 6.0, so the podspec does not raise this app's baseline.
- Expo UI declares the `swiftui` and `compose` core features. Its Android Gradle module
  applies the Compose compiler plugin at the project's Kotlin version. No new app config,
  Babel plugin, deployment target, or compiler override was needed for this React-state demo.
- Autolinking resolves `ExpoUI` / `ExpoUIModule` on Apple and
  `expo.modules.ui.ExpoUIModule` on Android at 57.0.19. This is discovery evidence,
  **not** successful native compilation or device-rendering evidence.
- Once this binary is installed, ordinary JS/TS scene edits can use Metro/Fast Refresh.
  Updating Expo UI or other native dependencies, SDK versions, or native configuration
  can require another rebuild; this foundation does not eliminate future native rebuilds.

`expo install --check` accepts the added Expo UI version but reports pre-existing patch
drift in 26 Expo packages, including Expo 57.0.21 (recommended ~57.0.24), Router 57.0.20
(~57.0.22), and build-properties 57.0.17 (~57.0.21). Those upgrades need their own scope.
Native compilation and interactive evaluation remain pending the next approved build.

## Verification and handoff

- Final `TMPDIR=/tmp/opencode NODE_OPTIONS=--max-old-space-size=8192 mise exec node@24 -- pnpm quality:agent` completed successfully with a 600000 ms timeout. Two web test timeouts on the earlier run passed in isolation and on the full rerun; no test timeout was increased.
- Native autolinking discovery, mobile/UI types, frozen-lockfile installation, Knip, and generated story/artifact checks passed.
- The user will review and commit the intended dev snapshot. No commit or remote build was performed. After that commit, run `pnpm dlx eas-cli@latest build --platform ios --profile development` from `apps/mobile`.

## Sources

- [SDK 57 platform/toolchain support](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions)
- [Expo UI installation and platforms](https://docs.expo.dev/versions/v57.0.0/sdk/ui/)
- [SwiftUI Picker and Host sizing](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/picker/)
- [Compose segmented buttons](https://docs.expo.dev/versions/v57.0.0/sdk/ui/jetpack-compose/segmentedbutton/)
- [SDK 57 native package source](https://github.com/expo/expo/tree/sdk-57/packages/expo-ui)
