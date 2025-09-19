#!/bin/bash
# install-components.sh
# Installs all your React Native reusable components using shadcn

COMPONENTS=(
  "accordion"
  "alert-dialog"
  "alert"
  "aspect-ratio"
  "avatar"
  "badge"
  "button"
  "card"
  "checkbox"
  "collapsible"
  "context-menu"
  "dialog"
  "dropdown-menu"
  "hover-card"
  "icon"
  "input"
  "label"
  "menubar"
  "native-only-animated-view"
  "popover"
  "progress"
  "radio-group"
  "select"
  "separator"
  "skeleton"
  "switch"
  "tabs"
  "text"
  "textarea"
  "toggle-group"
  "toggle"
  "tooltip"
)

BASE_URL="https://reactnativereusables.com/r/new-york"

# Ask user if they want to overwrite files
read -p "Some files might be identical. Do you want to use --overwrite? (Y/N): " OVERWRITE_CHOICE

if [[ "$OVERWRITE_CHOICE" =~ ^[Yy]$ ]]; then
  OVERWRITE_FLAG="--overwrite"
else
  OVERWRITE_FLAG=""
fi

echo "Installing all components using shadcn..."
for component in "${COMPONENTS[@]}"; do
  STYLE_JSON_URL="$BASE_URL/$component.json"
  echo "Installing $component from $STYLE_JSON_URL..."
  bunx shadcn@latest add "$STYLE_JSON_URL" $OVERWRITE_FLAG
done

echo "All components installed!"
