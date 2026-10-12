# Tally Prime XML Integration Notes & Golden Sample

## 1. Structure Overview
Business OS exports Sales vouchers in Tally Prime-compatible XML format (`<ENVELOPE>`). The XML uses the standard Tally XML envelope specification:
- `<HEADER>` with `<TALLYREQUEST>Import Data</TALLYREQUEST>`
- `<BODY><IMPORTDATA><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">`
- `<VOUCHER VCHTYPE="Sales" ACTION="Create">`

## 2. Double-Entry Accounting Sign Conventions in Tally
In Tally XML import format:
- **Debit Entry (Party / Debtor Ledger)**:
  - `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>`
  - `<AMOUNT>-1180.00</AMOUNT>` (Negative represents Debit in Tally XML standard format)
- **Credit Entry (Sales Account)**:
  - `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`
  - `<AMOUNT>1000.00</AMOUNT>` (Positive represents Credit in Tally XML standard format)
- **Credit Entry (Output CGST / SGST / IGST)**:
  - `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>`
  - `<AMOUNT>90.00</AMOUNT>` (Positive represents Credit)
- **Round-Off**:
  - Positive or negative depending on whether fractional paise were rounded up or down.

## 3. Synthetic Golden Sample
*Notice: This is a synthetic golden structure modeled on official Tally Prime standard XML specification. Real voucher names and GSTINs should be verified against the owner's company chart of accounts.*

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20261010</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV/2627/0001</VOUCHERNUMBER>
            <REFERENCE>INV/2627/0001</REFERENCE>
            <PARTYLEDGERNAME>Apex Motors</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Invoice View</PERSISTEDVIEW>
            <BASICBUYERNAME>Apex Motors</BASICBUYERNAME>
            <PARTYGSTIN>27AAPFU0939F1ZV</PARTYGSTIN>
            <PLACEOFSUPPLY>27</PLACEOFSUPPLY>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Apex Motors</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-1180.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>1000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>90.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>90.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
```

## 4. Owner Verification Steps in Tally Prime
When importing into Tally Prime:
1. Open Tally Prime > Press `Alt + O` (Import) > Transactions.
2. Select File Format `XML` and pick the exported file `tally_sales_YYYYMMDD.xml`.
3. Verify that the Party Ledger name exists in Tally or enable "Create new masters during import".
4. Check that Output CGST, Output SGST, and Output IGST ledger names match the configured names in Business OS Settings.
5. Review the imported voucher under `Display More Reports > Account Books > Sales Register`.
