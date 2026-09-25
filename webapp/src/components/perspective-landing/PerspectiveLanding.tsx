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

import type { JSX } from "react";
import { Box, Button, Card, CircularProgress, Stack, Typography } from "@wso2/oxygen-ui";
import { ArrowLeftIcon } from "@wso2/oxygen-ui-icons-react";
import { Link as RouterLink, Navigate } from "react-router";
import { useActivePerspective } from "@context/perspective/PerspectiveContext";
import { usePerspectiveVisibility } from "@components/side-rail/usePerspectiveVisibility";
import ErrorNotice from "@components/error-notice/ErrorNotice";

/**
 * The landing route for a perspective that has no overview of its own.
 *
 * Finance, Legal, People Ops and Security each used to open on a page of tiles
 * — one per rail item, built by hand, sitting two feet to the right of the rail
 * that already listed them. Reaching a screen took two clicks instead of one,
 * and every item added to a registry had to be remembered in a second place or
 * the tile page quietly fell behind. So these perspectives now open on the first
 * screen you can actually use, and the Overview row leaves their rail with it
 * (`forwardsToFirstItem` in @constants/perspectives).
 *
 * The route itself stays, because it is still reached — switching perspective
 * navigates to its `path` — and because someone who can see nothing here has to
 * be told that somewhere.
 *
 * Four states, in this order, and the order is the point:
 *
 *   resolving → hold. Every gate fails closed while it answers, so "your first
 *               item" read mid-flight is the wrong item or none at all, and
 *               redirecting on it would land people on a screen they didn't
 *               ask for or refuse them one they have.
 *   failed    → say so, with a Retry. Checked BEFORE the empty state for the
 *               same reason MarketingOpsShell checks it there: a failed request
 *               also leaves us with nothing to show, and reporting that as "you
 *               have no access" sends people chasing a permission they hold.
 *   have one  → go to it.
 *   have none → one sentence saying so, and where access comes from.
 *
 * Everything here reads from usePerspectiveVisibility, which is the rail's own
 * gate wiring — so this cannot send you somewhere the rail is hiding, or refuse
 * you a perspective whose rail has rows in it.
 */
export default function PerspectiveLanding(): JSX.Element {
  const active = useActivePerspective();
  const { visibleLeaves, isResolving, isError, error, retry } = usePerspectiveVisibility();
  const first = visibleLeaves[0]?.path;

  if (isResolving) {
    return (
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Opening {active.label}…
        </Typography>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Box>
        <PageTitle label={active.label} />
        <ErrorNotice onRetry={retry} error={error} sx={{ mt: 1.5 }}>
          Couldn&apos;t work out what you can open in {active.label}.
        </ErrorNotice>
      </Box>
    );
  }

  // `replace`, so Back leaves the perspective rather than bouncing off this
  // route and forwarding again.
  //
  // `state` for the same reason SideRail's RouteItem passes it: some
  // destinations sit outside their perspective's path prefix (Legal and Finance
  // both forward into the shared /due-diligence/* routes), and the rail asks the
  // URL first. Without this it falls through to the sessionStorage memory of the
  // last non-Me perspective, which happens to hold the right answer here — but
  // only because an effect ran before we left, which is not a thing to depend on.
  if (first) return <Navigate to={first} replace state={{ fromPerspective: active.key }} />;

  return (
    <Box>
      <PageTitle label={active.label} />
      <NothingHere label={active.label} icon={active.icon} />
    </Box>
  );
}

// An h1, not a styled div — a screen-reader user navigating by headings needs
// something to land on, and the card's heading below is an h2 under it.
function PageTitle({ label }: { label: string }): JSX.Element {
  return (
    <Typography component="h1" variant="h5" sx={{ mb: 0.5, mt: 0 }}>
      {label}
    </Typography>
  );
}

// Not a padlock, and not a warning. Nothing has failed and nobody has been
// refused — there is simply nothing in here for this person yet. The
// perspective's own icon says which empty room you're standing in, which a
// generic glyph wouldn't.
//
// Exported so a perspective that learns "nothing for you" from its backend rather than from
// the rail (RevOps: meet-app answers 403) shows the same card, not its own variant of it.
export function NothingHere({
  label,
  icon: Icon,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}): JSX.Element {
  return (
    <Card variant="outlined" sx={{ mt: 1.5, p: 3, maxWidth: 620 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.75 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 1.5,
            display: "grid",
            placeItems: "center",
            bgcolor: "background.default",
            border: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
          aria-hidden="true"
        >
          <Icon size={19} />
        </Box>
        <Box>
          <Typography
            component="h2"
            sx={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", mb: 0.6 }}
          >
            Nothing here for you yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: "52ch" }}>
            {/* One sentence, the same one everywhere. Each perspective used to
                add a line naming the system its access came from, and reading
                the five together was what killed them: only one was actually
                actionable, and the rest were "ask whoever runs that" with a
                different noun in it — the shape of help without the substance.
                Someone who needs access asks the person who sent them here. */}
            {label} is here, but none of it is open to you at the moment. When that
            changes, it&apos;ll appear in the menu on the left.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ height: "1px", bgcolor: "divider", my: 2.25 }} />

      {/* Outlined rather than contained: a11yThemeOverrides shifts outlined
          primary to primary.dark (5.77:1), while contained primary stays
          white-on-orange, which fails AA in both schemes — see the note there. */}
      <Button
        component={RouterLink}
        to="/me"
        variant="outlined"
        startIcon={<ArrowLeftIcon size={15} />}
        sx={{ textTransform: "none", fontSize: 13, fontWeight: 600 }}
      >
        Back to Home
      </Button>
    </Card>
  );
}
