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

import { Alert, Button } from "@wso2/oxygen-ui";
import MasterDataScreen from "../MasterDataScreen";
import { MASTER_DATA_SNACK } from "../masterDataUiText";
import { useInvoiceCostTypes, useMasterDataList } from "../useMasterData";

/**
 * The invoice account classification mappings.
 *
 * These decide which NetSuite account and department a travel invoice or per
 * diem bill is posted to. Until this screen existed they were maintained by
 * emailing Finance's spreadsheet to the Digital team, who inserted the rows
 * by hand — so a missing mapping surfaced as a failed NetSuite sync and took
 * a person in another team to fix.
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

  return (
    <MasterDataScreen
      tab="invoiceAccountMappings"
      rows={query.data ?? []}
      loading={query.isLoading}
      error={query.isError ? query.error : undefined}
      onRetry={() => {
        void query.refetch();
        void costTypes.refetch();
      }}
      costTypes={costTypes.data}
    >
      {/* The cost types failing is its own failure, not the table's: the rows
          can be entirely fine while the form's required Cost Type picker has
          nothing to offer. Reported on the page rather than in a snackbar so
          it carries its own retry, and so the rows stay readable — the
          screen's retry is only shown when the rows failed as well. */}
      {costTypes.isError && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void costTypes.refetch()}>
              Retry
            </Button>
          }
        >
          {MASTER_DATA_SNACK.error.costTypes}
        </Alert>
      )}
    </MasterDataScreen>
  );
}
