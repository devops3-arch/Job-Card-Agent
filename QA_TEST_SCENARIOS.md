# QA TEST SCENARIOS - PRODUCTION VALIDATION & ROLE HARDENING

**Date:** June 8, 2026  
**Purpose:** Guide for QA testing of validation rules and role restrictions

---

## TEST SCENARIO 1: Missing Customer Information

### Test Case 1.1: Missing Customer Name
```
SETUP:
- Role: Engineer
- Leave "Customer Name" field empty
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Customer Name is required"
✅ Backend: 400 error with code "VALIDATION_ERROR"
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.2: Missing Ref No
```
SETUP:
- Role: Engineer
- Leave "Ref No" field empty
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Ref No is required"
✅ Backend: 400 error with code "VALIDATION_ERROR"
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.3: Missing Job Card No
```
SETUP:
- Role: Engineer
- Leave "Job Card No" field empty
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Job Card No is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.4: Missing Date
```
SETUP:
- Role: Engineer
- Leave "Date" field empty
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Date is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.5: Missing Service Type (Purpose of Visit)
```
SETUP:
- Role: Engineer
- Leave "Purpose of Visit" (Service Type) unselected
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Purpose of Visit (Service Type) is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.6: Missing Manager Name
```
SETUP:
- Role: Engineer
- Leave "Manager Name" field empty
- Fill all other required fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Manager Name is required"
✅ Backend: 400 error "Manager Name is required"
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 1.7: All Customer Info Complete
```
SETUP:
- Role: Engineer
- Fill all 11 required customer info fields:
  ✅ Customer Name
  ✅ Ref No
  ✅ Job Card No
  ✅ Date
  ✅ Service Type
  ✅ Customer Code
  ✅ Attention Of
  ✅ Contact No
  ✅ Engineer Name
  ✅ Sales Area
  ✅ Manager Name
- Click Save

EXPECTED RESULT:
✅ No customer info error messages
✅ Move to next validation (equipment, checklists, etc.)

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 2: Equipment Details Validation

### Test Case 2.1: Missing Equipment Model
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Leave "Equipment Model" empty
- Fill all other equipment fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Equipment Model is required"
✅ Backend: 400 error "Equipment Model is required"
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 2.2: Missing Brand Description
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Equipment Model: Kaeser
- Leave "Brand Description" empty
- Fill other equipment fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Brand Description is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 2.3: Missing Part No
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill Equipment Model and Brand Description
- Leave "Part No" empty
- Fill other fields
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Equipment Part No is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 2.4: Missing Serial No
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill Equipment Model, Brand Description, Part No
- Leave "Serial No" empty
- Fill Year
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Equipment Serial No is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 2.5: Missing Year
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill Equipment Model, Brand Description, Part No, Serial No
- Leave "Year" empty
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Equipment Year is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 2.6: All Equipment Details Complete
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill all 5 equipment fields:
  ✅ Equipment Model
  ✅ Brand Description
  ✅ Part No
  ✅ Serial No
  ✅ Year
- Click Save

EXPECTED RESULT:
✅ No equipment error messages
✅ Move to next validation (checklists)

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 3: Checklist Validation

### Test Case 3.1: Incomplete Compressor Checklist
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill all equipment details (passes validation)
- Compressor Checklist: Leave 3 items unselected (status empty)
- Dryer Checklist: Select all items (all have status)
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Please complete all Compressor checklist items. 3 item(s) missing status."
✅ Backend: 400 error with VALIDATION_ERROR
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 3.2: Incomplete Dryer Checklist
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill all equipment details (passes validation)
- Compressor Checklist: Select all items (all have status)
- Dryer Checklist: Leave 5 items unselected (status empty)
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Please complete all Dryer checklist items. 5 item(s) missing status."
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 3.3: Both Checklists Incomplete
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill all equipment details (passes validation)
- Compressor Checklist: Leave 2 items unselected
- Dryer Checklist: Leave 3 items unselected
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Please complete all Compressor checklist items. 2 item(s) missing status."
✅ (Compressor error shown first)
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 3.4: All Checklists Complete
```
SETUP:
- Role: Engineer
- Fill all customer info (passes validation)
- Fill all equipment details (passes validation)
- Compressor Checklist: Select all items (status = done/pending/na)
- Dryer Checklist: Select all items (status = done/pending/na)
- Click Save

EXPECTED RESULT:
✅ No checklist error messages
✅ Move to next validation (parts/labor)

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 4: Parts Validation

### Test Case 4.1: Missing Part Description
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1:
  - Description: [EMPTY]
  - Part Number: ABC123
  - Quantity: 2
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Part 1: Description is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 4.2: Missing Part Number
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1:
  - Description: Compressor Oil
  - Part Number: [EMPTY]
  - Quantity: 2
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Part 1: Part Number is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 4.3: Invalid Quantity (Zero)
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1:
  - Description: Compressor Oil
  - Part Number: ABC123
  - Quantity: 0
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Part 1: Quantity must be greater than 0"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 4.4: Invalid Quantity (Negative)
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1:
  - Description: Compressor Oil
  - Part Number: ABC123
  - Quantity: -5
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Part 1: Quantity must be greater than 0"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 4.5: Multiple Parts with One Invalid
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1: (Valid)
  - Description: Compressor Oil
  - Part Number: ABC123
  - Quantity: 2
- Add Part 2: (Invalid - missing description)
  - Description: [EMPTY]
  - Part Number: XYZ789
  - Quantity: 1
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Part 2: Description is required"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 4.6: Valid Parts Added
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists (all pass)
- Add Part 1:
  - Description: Compressor Oil
  - Part Number: ABC123
  - Quantity: 2
- Add Part 2:
  - Description: Air Filter
  - Part Number: XYZ789
  - Quantity: 1
- Click Save

EXPECTED RESULT:
✅ No part validation errors
✅ Move to next validation (labor)

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 5: Labor Validation

### Test Case 5.1: Invalid Labor Hours (Zero)
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists, valid parts (all pass)
- Add Labor 1:
  - Hours: 0
  - Rate/Hr: 100
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Labor 1: Hours must be greater than 0"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 5.2: Invalid Labor Hours (Negative)
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists, valid parts (all pass)
- Add Labor 1:
  - Hours: -5
  - Rate/Hr: 100
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Labor 1: Hours must be greater than 0"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 5.3: Valid Labor (Description Optional)
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists, valid parts (all pass)
- Add Labor 1:
  - Description: [EMPTY - Optional]
  - Hours: 8
  - Rate/Hr: 100
- Click Save

EXPECTED RESULT:
✅ No labor validation errors
✅ Labor accepted even without description
✅ Job saved successfully

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 5.4: Multiple Labor Entries with One Invalid
```
SETUP:
- Role: Engineer
- Fill all customer info, equipment, checklists, valid parts (all pass)
- Add Labor 1: (Valid)
  - Hours: 8
  - Rate/Hr: 100
- Add Labor 2: (Invalid - zero hours)
  - Hours: 0
  - Rate/Hr: 100
- Click Save

EXPECTED RESULT:
✅ Frontend: Toast error "Labor 2: Hours must be greater than 0"
✅ Backend: 400 error
✅ Job NOT created

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 6: Engineer Pricing Restrictions

### Test Case 6.1: Engineer Cannot See Unit Price Input
```
SETUP:
- Role: Engineer
- View Parts section
- Check if "Unit Price" input field is visible

EXPECTED RESULT:
✅ Unit Price input is NOT visible for engineers
✅ Quantity column only shown
✅ No pricing information editable

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 6.2: Engineer Cannot See Discount Input
```
SETUP:
- Role: Engineer
- Scroll to Cost Summary section
- Check for Discount input

EXPECTED RESULT:
✅ Discount % input NOT visible
✅ Discount field NOT editable
✅ Read-only view shown

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 6.3: Engineer Cannot See Service Charge Input
```
SETUP:
- Role: Engineer
- Sales Area: Abu Dhabi Variable
- Check Cost Summary section

EXPECTED RESULT:
✅ Service Charge input NOT visible for engineers
✅ Service Charge value shown (read-only)
✅ Information banner shown: "Read-only view"

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 6.4: Engineer Cannot See Other Expenses Input
```
SETUP:
- Role: Engineer
- Check Cost Summary section

EXPECTED RESULT:
✅ Other Expenses input NOT visible
✅ Engineer sees read-only cost totals only
✅ Informational banner visible

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 6.5: Engineer Sees Read-Only Cost Summary
```
SETUP:
- Role: Engineer
- Add parts with prices (if manager created job first)
- View Cost Summary

EXPECTED RESULT:
✅ Engineer sees:
  - Parts Total (read-only)
  - Service Charge (read-only)
  - Labor Total (read-only)
  - Total After Discount (read-only)
  - VAT (read-only)
  - Grand Total (read-only)
✅ Informational banner: "Read-only view — Pricing controls restricted to managers"
✅ NO editable pricing fields

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 7: Manager Pricing Access

### Test Case 7.1: Manager Can See Unit Price Input
```
SETUP:
- Role: Manager
- View Parts section

EXPECTED RESULT:
✅ Unit Price input field is VISIBLE
✅ Manager can edit unit prices
✅ Total Price automatically calculated

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 7.2: Manager Can Edit Discount
```
SETUP:
- Role: Manager
- View Cost Summary section

EXPECTED RESULT:
✅ Discount % input VISIBLE
✅ Manager can enter discount value
✅ Discount amount auto-calculated
✅ Total automatically updated

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 7.3: Manager Can Edit Service Charge
```
SETUP:
- Role: Manager
- Sales Area: Abu Dhabi Variable
- View Cost Summary section

EXPECTED RESULT:
✅ Service Charge input VISIBLE
✅ Manager can enter/edit service charge value
✅ Total updated automatically

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 7.4: Manager Can Edit Other Expenses
```
SETUP:
- Role: Manager
- View Cost Summary section

EXPECTED RESULT:
✅ Other Expenses input VISIBLE
✅ Manager can enter amount
✅ Total cost updated automatically

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 7.5: Manager Full Costing Control
```
SETUP:
- Role: Manager
- View entire Cost Summary section

EXPECTED RESULT:
✅ Manager sees ALL fields:
  - Parts Total
  - Service Charge (editable)
  - Labor Total
  - Other Expenses (editable)
  - Total Cost
  - Discount % (editable)
  - Discount Amount (auto)
  - Total After Discount
  - VAT
  - Grand Total
✅ NO read-only banner
✅ Full editing capability

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## TEST SCENARIO 8: End-to-End Job Creation

### Test Case 8.1: Complete Valid Job Creation
```
SETUP:
- Role: Engineer
- Fill ALL required information:
  ✅ 11 Customer Info fields
  ✅ 5 Equipment Details fields
  ✅ All Compressor Checklist items
  ✅ All Dryer Checklist items
  ✅ 2-3 Parts (with description, number, qty>0)
  ✅ 1-2 Labor entries (with hours>0)
- Click Save

EXPECTED RESULT:
✅ No validation errors
✅ Job created successfully
✅ Success toast shown
✅ Job ID returned
✅ Engineer CAN'T see pricing controls

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 8.2: Manager Completes Pricing on Engineer Job
```
SETUP:
- Previous job created by engineer (all data entered)
- Role: Manager
- View the job
- Engineer didn't set prices (no manager assigned yet)

EXPECTED RESULT:
✅ Manager can:
  - See Unit Price inputs (empty)
  - Set prices for all parts
  - Edit Service Charge
  - Edit Discount
  - Set Other Expenses
  - Update job with pricing
✅ Job successfully saved with pricing

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

### Test Case 8.3: Manager Approval Flow
```
SETUP:
- Job has all data + pricing completed
- Role: Manager
- Click "Approve" or equivalent action

EXPECTED RESULT:
✅ Manager can approve job
✅ Job status changes to APPROVED
✅ No changes to approval workflow
✅ Job can be exported as PDF/Excel

ACTUAL RESULT:
[ ] PASS [ ] FAIL
Notes: _______________________________________________
```

---

## SUMMARY OF TEST SCENARIOS

### Total Test Cases: 30+
- Customer Info Validation: 7 cases
- Equipment Details Validation: 6 cases
- Checklist Validation: 4 cases
- Parts Validation: 6 cases
- Labor Validation: 4 cases
- Engineer Restrictions: 5 cases
- Manager Access: 5 cases
- End-to-End Flow: 3 cases

### Success Criteria:
- [ ] ALL test cases PASS
- [ ] No blocking issues found
- [ ] Role restrictions working correctly
- [ ] Error messages clear and actionable
- [ ] No regression in existing functionality

---

**QA Testing Guide Complete**

Print this document and use for manual testing verification.
