import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./index.web";

describe("NavigationMenu web", () => {
  it("renders shared navigation menu primitives", () => {
    renderWeb(
      <NavigationMenu viewport={false}>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Workouts</NavigationMenuTrigger>
            <NavigationMenuContent forceMount>
              <NavigationMenuLink href="/plans">Plan library</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expect(screen.getByRole("button", { name: "Workouts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan library" })).toHaveAttribute("href", "/plans");
  });
});
