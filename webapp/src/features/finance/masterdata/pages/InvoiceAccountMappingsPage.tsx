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

import { useEffect } from "react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import MasterDataScreen from "../MasterDataScreen";
import { MASTER_DATA_SNACK } from "../masterDataUiText";
import { useInvoiceCostTypes, useMasterDataList } from "../useMasterData";

/**
 * The invoice account classification mappings.
 *
 * These decide which NetSuite account and department a travel invoice or per
 * diem bill is posted to. Until this screen existed they were maintained by
 * emailing Finance's spreadsheet to the Digital team, who ran an INSERT
 * against the Travel production database by hand — so a missing mapping
 * surfaced as a failed NetSuite sync and took a person in another team to
 * fix.
 *
 * Travel Invoice mappings and Per diem mappings are one table, not two: the
 * cost type is what separates them, and "Currency (per diem / allowances)" is
 * the per diem one. So this is a single screen with a Cost Type column rather
 * than the two screens Finance's two spreadsheet tabs might suggest.
 *
 * A plain list, with no filter bar: the table is small enough that the
 * grid's own search and Column Search answer "which mapping covers this
 * code", and every column is already on screen.
 */
export default function InvoiceAccountMappingsPage() {
  const query = useMasterDataList("invoiceAccountMappings");
  const costTypes = useInvoiceCostTypes();
  const { showError } = useNotifications();

  // The cost types failing is its own message, separate from the rows
  // failing: it leaves the form's Cost Type picker empty while the table may
  // still be perfectly fine.
  useEffect(() => {
    if (costTypes.isError) showError(MASTER_DATA_SNACK.error.costTypes);
  }, [costTypes.isError, showError]);

  return (
    <MasterDataScreen
      tab="invoiceAccountMappings"
      rows={query.data ?? []}
      loading={query.isLoading}
      error={query.isError ? query.error : undefined}
      onRetry={() => void query.refetch()}
      costTypes={costTypes.data}
    />
  );
}
