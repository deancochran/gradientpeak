import type { Meta, StoryObj } from "@storybook/react";

import { tableFixtures } from "./fixtures";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./index.web";

const meta = {
  title: "Components/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <Table>
      <TableCaption>{tableFixtures.weeklyWorkouts.caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {tableFixtures.weeklyWorkouts.columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tableFixtures.weeklyWorkouts.rows.map((row) => (
          <TableRow key={row[0]}>
            {row.map((cell) => (
              <TableCell key={cell}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
