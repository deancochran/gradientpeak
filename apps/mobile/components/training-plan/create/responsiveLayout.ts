type ResponsiveLayoutInput = {
  fontScale: number;
  width: number;
};

export function shouldUseAccessibleBuilderLayout({ fontScale, width }: ResponsiveLayoutInput) {
  return width < 360 || fontScale > 1.15;
}
