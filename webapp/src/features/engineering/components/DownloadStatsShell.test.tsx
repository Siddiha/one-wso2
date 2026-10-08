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

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  DOWNLOAD_STATS_DESCRIPTION,
  DOWNLOAD_STATS_HEADING,
  downloadStatsPaths,
  type DownloadStatsScreen,
} from "@constants/downloadStatsApps";
import DownloadStatsShell from "./DownloadStatsShell";

// The ladder every Download Stats screen stands behind, rendered on its route
// with the HTTP boundary mocked. The screen itself is a probe: on every rung
// but the last it must be absent, which is also how we know it asked for
// nothing.

vi.mock("@asgardeo/react", () => ({
  useAsgardeo: () => ({
    isSignedIn: true,
    isLoading: false,
    getAccessToken: async () => "test-token",
    signIn: vi.fn(),
  }),
}));

const originalConfig = window.config;

afterEach(() => {
  window.config = originalConfig;
  vi.unstubAllGlobals();
});

function configure(overrides: Partial<NonNullable<Window["config"]>> = {}) {
  window.config = {
    ...(window.config ?? {}),
    ONE_WSO2_PREVIEW_FEATURES: { engineering: true },
    ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL: "https://stats.example",
    ...overrides,
  } as Window["config"];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function userInfo(answer: () => Promise<Response>) {
  return vi.fn(async (url: string) => (url.includes("/user-info") ? answer() : json({}, 404)));
}

function show(screenKey: DownloadStatsScreen, actions?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return Object.assign(
    render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[downloadStatsPaths[screenKey]]}>
        <Routes>
          <Route
            path={downloadStatsPaths[screenKey]}
            element={
              <DownloadStatsShell screen={screenKey} actions={actions}>
                <div>the real screen</div>
              </DownloadStatsShell>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    ),
    { client },
  );
}

const theScreen = () => screen.queryByText("the real screen");
const denial = () => screen.queryByText(/don't have access to admin/i);

describe("the screen tabs", () => {
  it("offers the five open screens under the description, with the open one selected", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ email: "a@wso2.com", isAdmin: false })));
    show("downloads");

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Downloads",
      "Versions",
      "Packages",
      "Repository Stats",
    ]);
    expect(screen.getByRole("tab", { name: "Downloads" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("href", downloadStatsPaths.overview);
    expect(screen.getByRole("tab", { name: "Repository Stats" })).toHaveAttribute(
      "href",
      downloadStatsPaths.repositoryStats,
    );
    expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument();

    const description = screen.getByText(DOWNLOAD_STATS_DESCRIPTION);
    expect(
      description.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Downloads" })).not.toBeInTheDocument();
  });

  it("adds Admin, last and selected, when the API says the reader is an Admin", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ email: "a@wso2.com", isAdmin: true })));
    show("admin", <button type="button">Add tracked repository</button>);

    expect(await screen.findByRole("tab", { name: "Admin" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Downloads",
      "Versions",
      "Packages",
      "Repository Stats",
      "Admin",
    ]);
    expect(screen.getByRole("tab", { name: "Admin" })).toHaveAttribute("href", downloadStatsPaths.admin);
    expect(screen.getByRole("button", { name: "Add tracked repository" })).toBeInTheDocument();
  });

  it("keeps the five tabs and leaves them all unlit while the Admin check is running", () => {
    configure();
    vi.stubGlobal("fetch", userInfo(() => new Promise<Response>(() => {})));
    show("admin");

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Downloads",
      "Versions",
      "Packages",
      "Repository Stats",
    ]);
    expect(screen.queryByRole("tab", { selected: true })).not.toBeInTheDocument();
    expect(screen.getByText(/checking your admin access/i)).toBeInTheDocument();
  });

  it("keeps the tabs above the description when Download Stats is not connected", () => {
    configure({ ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL: "" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    show("overview");

    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/download stats isn't connected yet/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the five tabs unlit on an Admin address the reader is refused", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ email: "a@wso2.com", isAdmin: false })));
    show("admin");

    expect(await screen.findByText(/don't have access to admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { selected: true })).not.toBeInTheDocument();
    // The Admin tab is hidden here, so the heading is the only name for the screen.
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
  });

  // A later failure must not keep the previous "yes". The query still holds
  // that answer, and lighting Admin over the error would say the check passed.
  it("drops the Admin tab when a later check fails, and leaves the others unlit", async () => {
    configure();
    let fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.includes("/user-info")) return json({}, 404);
        if (fail) return json({ message: "gateway timed out" }, 502);
        return json({ email: "a@wso2.com", isAdmin: true });
      }),
    );
    const { client } = show("admin");

    expect(await screen.findByRole("tab", { name: "Admin" })).toHaveAttribute("aria-selected", "true");
    fail = true;
    await client.invalidateQueries({ queryKey: ["product-download-stats", "user-info"] });

    await waitFor(() => expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument());
    expect(screen.queryByRole("tab", { selected: true })).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't check admin access/i)).toBeInTheDocument();
  });

  it("keeps the five tabs unlit when the Admin check fails", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ message: "gateway timed out" }, 502)));
    show("admin");

    expect(await screen.findByText(/couldn't check admin access/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { selected: true })).not.toBeInTheDocument();
  });

});

describe("a screen anyone may open", () => {
  it("renders the description under the title and above the tabs, without a second title", async () => {
    configure();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/user-info")) return json({ email: "a@wso2.com", isAdmin: false });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    show("overview");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const appTitle = screen.getByRole("heading", { level: 1, name: DOWNLOAD_STATS_HEADING });
    const description = screen.getByText(DOWNLOAD_STATS_DESCRIPTION);
    expect(
      appTitle.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      description.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    expect(theScreen()).toBeInTheDocument();
    // The screen itself asks for nothing. The one request is the Admin tab.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/user-info"),
    ]);
  });

  it.each<[DownloadStatsScreen, string]>([
    ["overview", "Overview"],
    ["downloads", "Downloads"],
    ["versions", "Versions"],
    ["packages", "Packages"],
    ["repositoryStats", "Repository Stats"],
  ])("opens %s with the app sentence and no second title", (key, title) => {
    configure();
    vi.stubGlobal("fetch", vi.fn());
    show(key);
    expect(screen.getByRole("tab", { name: title })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: title })).not.toBeInTheDocument();
    expect(screen.getByText(DOWNLOAD_STATS_DESCRIPTION)).toBeInTheDocument();
    expect(theScreen()).toBeInTheDocument();
  });

  it("allows an http address on localhost", () => {
    configure({ ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL: "http://localhost:8080" });
    show("downloads");
    expect(theScreen()).toBeInTheDocument();
  });
});

describe("the ladder in front of every screen", () => {
  it("names the missing setting when the API address is unset, and makes no request", () => {
    configure({ ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL: "" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    show("admin");
    expect(screen.getByText(/download stats isn't connected yet/i)).toBeInTheDocument();
    expect(screen.getByText("ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL")).toBeInTheDocument();
    // The Admin tab stays hidden until the API can be asked, so the heading
    // still names the screen, and the sentence still describes it.
    expect(screen.queryByRole("tab", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText(DOWNLOAD_STATS_DESCRIPTION)).toBeInTheDocument();
    expect(denial()).not.toBeInTheDocument();
    expect(theScreen()).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an http address that is not localhost, and sends no token to it", () => {
    configure({ ONE_WSO2_PRODUCT_DOWNLOAD_STATS_BACKEND_URL: "http://stats.example" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    show("admin");
    expect(screen.getByText(/needs an https address/i)).toBeInTheDocument();
    expect(screen.getByText(DOWNLOAD_STATS_DESCRIPTION)).toBeInTheDocument();
    expect(denial()).not.toBeInTheDocument();
    expect(theScreen()).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Admin check", () => {
  it("shows a spinner while the API is deciding, and no denial", () => {
    configure();
    vi.stubGlobal("fetch", userInfo(() => new Promise<Response>(() => {})));
    show("admin");
    expect(screen.getByText(/checking your admin access/i)).toBeInTheDocument();
    expect(denial()).not.toBeInTheDocument();
    expect(theScreen()).not.toBeInTheDocument();
  });

  // Before the denied rung, not after. A failed request also leaves us with no
  // answer, and reporting that as a missing permission sends someone chasing
  // a role they already hold.
  it("reports a failed check as an error with Retry, never as a denial", async () => {
    configure();
    const fetchMock = userInfo(async () => json({ message: "gateway timed out" }, 502));
    vi.stubGlobal("fetch", fetchMock);
    show("admin");
    expect(await screen.findByText(/couldn't check admin access/i)).toBeInTheDocument();
    expect(denial()).not.toBeInTheDocument();
    expect(theScreen()).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("treats the API's 403 as the answer no, not as a failed check", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ message: "forbidden" }, 403)));
    show("admin");
    expect(await screen.findByText(/don't have access to admin/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't check admin access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("explains the refusal to someone the API says is not an Admin, and keeps the screen's actions back", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ email: "a@wso2.com", isAdmin: false })));
    show("admin", <button type="button">Add tracked repository</button>);
    expect(await screen.findByText(/don't have access to admin/i)).toBeInTheDocument();
    expect(screen.getByText(/ask someone who already manages that list/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    // The sentence names the app, not the withheld screen, so it stays.
    expect(screen.getByText(DOWNLOAD_STATS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tracked repository" })).not.toBeInTheDocument();
    expect(theScreen()).not.toBeInTheDocument();
  });

  it("renders the screen, its description and its actions for an Admin", async () => {
    configure();
    vi.stubGlobal("fetch", userInfo(async () => json({ email: "a@wso2.com", isAdmin: true })));
    show("admin", <button type="button">Add tracked repository</button>);
    expect(await screen.findByText("the real screen")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Admin" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByText(DOWNLOAD_STATS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tracked repository" })).toBeInTheDocument();
    expect(denial()).not.toBeInTheDocument();
  });
});
