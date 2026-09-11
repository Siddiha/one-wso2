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

// Department name -> a stable color, for the row avatar background and the
// sidebar's department legend/filter. "Department" here is the employee
// directory's `team` field (see orgChartTypes.ts) — the closest-granularity
// equivalent to the org-chart backend's original `department` field, which
// this endpoint doesn't have. Fixed for WSO2's named departments, with a
// stable hash fallback so a team not listed here still gets a consistent
// color instead of none.

const DEPARTMENT_COLOR: Record<string, string> = {
  ENGINEERING: "#2a78d6",
  "CUSTOMER SUCCESS": "#1a7a1a",
  SALES: "#b5790a",
  "SALES ENGINEERING": "#128f63",
  MARKETING: "#c14a78",
  FINANCE: "#c53a39",
  "DIGITAL TRANSFORMATION": "#4a3aa7",
  "PEOPLE OPERATIONS": "#c04f1f",
  "BUSINESS OPERATIONS": "#4a5f99",
  "CHANNEL SALES": "#0f8a8a",
  LEGAL: "#7a3c7f",
  ADMINISTRATION: "#935a2e",
  OTHER: "#71757f",
};

const FALLBACK_COLORS = Object.values(DEPARTMENT_COLOR);

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function departmentColor(department: string | null | undefined): string {
  const key = (department ?? "OTHER").trim().toUpperCase();
  return DEPARTMENT_COLOR[key] ?? hashColor(key);
}

export interface DepartmentStat {
  name: string;
  count: number;
}

/** Department name -> headcount from the flat directory, largest first. */
export function departmentStats(employees: readonly { department: string | null }[]): DepartmentStat[] {
  const counts = new Map<string, number>();
  employees.forEach((employee) => {
    const name = employee.department?.trim();
    if (!name) return;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
