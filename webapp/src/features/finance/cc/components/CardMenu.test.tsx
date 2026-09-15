/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardMenu } from "./CardMenu";
import type { CcCreditCard } from "../ccTypes";

const cards = [
  { id: 1, ccNumber: "111122223333", label: "Travel", bankCode: "amex", status: "Active", countNew: 3 },
  { id: 2, ccNumber: "444455556666", label: null, bankCode: "svb", status: "Active", countNew: 0 },
] as unknown as CcCreditCard[];

const onSelect = vi.fn();
const onRename = vi.fn();

beforeEach(() => {
  onSelect.mockClear();
  onRename.mockClear();
});

const show = (rename = true) =>
  render(
    <CardMenu
      cards={cards}
      active="111122223333"
      onSelect={onSelect}
      badge="countNew"
      onRename={rename ? onRename : undefined}
    />,
  );

const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("combobox", { name: "Credit card" }));

// CardMenu.tsx in the source: a dropdown showing the card's name and its full
// number, with the bank's mark and any outstanding count on each option.
describe("picking a card", () => {
  it("shows the selected card's name and number", () => {
    show();
    expect(screen.getByRole("combobox", { name: "Credit card" })).toHaveTextContent(
      "Travel(111122223333)",
    );
  });

  it("selects the card that was chosen", async () => {
    const user = userEvent.setup();
    show();
    await openMenu(user);
    await user.click(screen.getByRole("option", { name: /444455556666/ }));
    expect(onSelect).toHaveBeenCalledWith("444455556666");
  });

  it("numbers an unlabelled card by its position, as the source does", async () => {
    const user = userEvent.setup();
    show();
    await openMenu(user);
    // `Card ${index + 1}` — the second card has no label of its own.
    expect(screen.getByRole("option", { name: /Card 2/ })).toBeInTheDocument();
    // The first has one, so it is used instead of "Card 1".
    expect(screen.queryByRole("option", { name: /Card 1/ })).toBeNull();
  });

  it("counts what is outstanding on a card, and says nothing when there is nothing", async () => {
    const user = userEvent.setup();
    show();
    await openMenu(user);
    expect(within(screen.getByRole("option", { name: /Travel/ })).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("option", { name: /Card 2/ })).queryByText("0")).toBeNull();
  });
});

describe("renaming", () => {
  it("renames the card that is selected", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Rename card" }));
    const field = screen.getByRole("textbox", { name: "Card label" });
    await user.clear(field);
    await user.type(field, "Travel EU");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith(cards[0], "Travel EU");
  });

  it("seeds the dialog with the label the card already has", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Rename card" }));
    expect(screen.getByRole("textbox", { name: "Card label" })).toHaveValue("Travel");
  });

  it("does not switch card on the way to rename", async () => {
    // The tiles this replaced put the rename button INSIDE a role="button"
    // tile, so reaching it by keyboard both opened the dialog and switched
    // card. Here it is a sibling of the select and cannot select anything.
    const user = userEvent.setup();
    show();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers no rename affordance when the caller cannot rename", () => {
    show(false);
    expect(screen.queryByRole("button", { name: "Rename card" })).not.toBeInTheDocument();
  });
});
