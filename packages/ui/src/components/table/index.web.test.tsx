import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./index.web";

describe("Table web", () => {
  it("renders semantic table structure", () => {
    renderWeb(
      <Table>
        <TableCaption>Weekly workouts</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Monday</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByText("Weekly workouts")).toBeInTheDocument();
  });
});
