// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { describe, expect, it, vi } from "vitest";
import { RadioIcon } from "@wso2/oxygen-ui-icons-react";
import type { PerspectiveDef } from "@constants/perspectives";

// Stubbed with factories for the same reason PerspectiveLanding.test.tsx does: RevOpsShell
// imports NothingHere from PerspectiveLanding, whose visibility hook pulls @asgardeo/browser
// into the module graph, and that package does not resolve under vitest's ESM loader.
vi.mock("@components/side-rail/usePerspectiveVisibility", () => ({
  usePerspectiveVisibility: () => ({
    resolveVisible: () => true,
    isResolving: false,
    visibleLeaves: [],
    isError: false,
    retry: () => {},
  }),
}));
const revops: PerspectiveDef = {
  key: "revops",
  label: "RevOps",
  icon: RadioIcon,
  access: true,
  path: "/revops",
};
vi.mock("@context/perspective/PerspectiveContext", () => ({
  useActivePerspective: () => revops,
}));

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import RevOpsShell from "./RevOpsShell";

function renderShell(props: { configured: boolean; forbidden?: boolean }) {
  return render(
    <MemoryRouter>
      <RevOpsShell title="RevOps" configKey="ONE_WSO2_REVOPS_BACKEND_URL" {...props}>
        <div>meeting list</div>
      </RevOpsShell>
    </MemoryRouter>,
  );
}

describe("RevOpsShell", () => {
  it("says RevOps is not connected, and names the key to set, when no backend URL is configured", () => {
    renderShell({ configured: false });
    expect(screen.getByText(/RevOps isn't connected yet/)).toBeInTheDocument();
    expect(screen.getByText("ONE_WSO2_REVOPS_BACKEND_URL")).toBeInTheDocument();
    expect(screen.queryByText("meeting list")).not.toBeInTheDocument();
  });

  // The backend answers 403 on every endpoint for a caller in no authorised group; the page
  // shows the same "nothing here" card as every other perspective, not a RevOps-only refusal.
  it("shows the shared no-access card, with a way home, when the backend refuses the caller", () => {
    renderShell({ configured: true, forbidden: true });
    expect(screen.getByRole("heading", { name: "Nothing here for you yet" })).toBeInTheDocument();
    expect(screen.getByText(/RevOps is here, but none of it is open to you/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/me");
    expect(screen.queryByText("meeting list")).not.toBeInTheDocument();
  });

  it("never says Echo -- the product is RevOps on every state of the page", () => {
    for (const props of [{ configured: false }, { configured: true, forbidden: true }]) {
      const { container, unmount } = renderShell(props);
      expect(container.textContent).not.toMatch(/Echo/);
      unmount();
    }
  });

  it("renders the page content when connected and allowed", () => {
    renderShell({ configured: true, forbidden: false });
    expect(screen.getByText("meeting list")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here for you yet")).not.toBeInTheDocument();
  });
});
