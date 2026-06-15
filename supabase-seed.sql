-- Run AFTER supabase-setup.sql
-- Seeds the database with current dashboard data

insert into dashboard_data (id, data)
values (1, '{
  "clinics": [
    {
      "name": "Chula Vista",
      "status": "Active - High Capacity",
      "indicator": "green",
      "category": "Operations",
      "operations": [
        "Operating 10-hour shifts",
        "Open 6 days per week",
        "100% booked capacity",
        "Operators split to reduce overtime exposure"
      ],
      "team": ["HMS Operations", "Clinic Operators"],
      "risks": [
        { "label": "Capacity constraints", "severity": "medium" },
        { "label": "Overtime exposure", "severity": "medium" },
        { "label": "Payroll compliance review", "severity": "medium" }
      ],
      "next_action": "Evaluate expansion opportunities or relocation to support 3-4 chamber growth.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 3200", "serial": "SC-3200-001", "warranty": "2027-06", "vendor": "Sechrist Industries", "status": "operational" },
        { "name": "Chamber 2", "model": "Sechrist 3200", "serial": "SC-3200-002", "warranty": "2027-06", "vendor": "Sechrist Industries", "status": "operational" },
        { "name": "O2 Concentrator", "model": "Invacare Perfecto2", "serial": "INV-O2-041", "warranty": "2026-12", "vendor": "Invacare", "status": "operational" }
      ],
      "issues": [
        { "id": 1, "description": "Payroll compliance review outstanding — need legal sign-off on operator split structure", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-05-15" },
        { "id": 2, "description": "Assael Hernandez Munguia — HBOT hold, peer review pending. Updated LMN submitted Jun 9. Awaiting insurance decision.", "priority": "medium", "owner": "TMS / HMS", "status": "open", "opened": "2026-06-05" }
      ],
      "vendors": [
        { "name": "AT&T Business Fiber", "type": "ISP", "account": "ATT-CV-8821", "contact": "800-321-2000", "contract_notes": "500Mbps, contract through 2027-03" },
        { "name": "Sechrist Industries", "type": "Equipment", "account": "SECH-0441", "contact": "714-579-8400", "contract_notes": "Service contract, annual renewal" }
      ],
      "notes": "Network: Cisco RV340 router at 192.168.1.1. Unmanaged 8-port switch in back closet. NVR (cameras) at 192.168.1.50. Chamber control panels on 192.168.2.x subnet.\n\nAccess: Key code 4821 for main door. Equipment room is second door on left.",
      "action_items": [
        { "task": "Get legal sign-off on operator split payroll structure", "owner": "HMS Ops", "due": "2026-06-30", "status": "open" },
        { "task": "Survey space for 3rd chamber installation feasibility", "owner": "Westaway", "due": "2026-07-15", "status": "open" }
      ],
      "capex": [
        { "description": "3rd chamber expansion (projected)", "amount": 85000, "category": "Equipment", "vendor": "TBD", "expected_date": "2026-Q4", "status": "planned" }
      ]
    },
    {
      "name": "Laguna",
      "status": "Active - Structural Review",
      "indicator": "yellow",
      "category": "Operations",
      "operations": [
        "HMS currently supporting operations",
        "Local business development efforts underway",
        "Revenue allocation tracked through Account #6002",
        "Office Ally and TMS billing integration active"
      ],
      "team": ["Bobby", "Stacey", "Michael Greenhalgh", "HMS Leadership"],
      "risks": [
        { "label": "No finalized operating agreement", "severity": "high" },
        { "label": "Reimbursement allocation review", "severity": "medium" },
        { "label": "MOU structure pending", "severity": "medium" }
      ],
      "next_action": "Finalize MOU or receivership structure and establish long-term operating framework.",
      "equipment": [
        { "name": "Chamber 1", "model": "Perry Sigma 34", "serial": "PS-34-LA01", "warranty": "2026-09", "vendor": "Perry Baromedical", "status": "operational" },
        { "name": "Chamber 2", "model": "Perry Sigma 34", "serial": "PS-34-LA02", "warranty": "2026-09", "vendor": "Perry Baromedical", "status": "operational" }
      ],
      "issues": [
        { "id": 1, "description": "Operating agreement with Skincredible not finalized — revenue allocation at risk", "priority": "high", "owner": "Michael Greenhalgh", "status": "open", "opened": "2026-04-01" },
        { "id": 2, "description": "MOU structure needs legal review before month-end", "priority": "medium", "owner": "HMS Leadership", "status": "open", "opened": "2026-05-20" }
      ],
      "vendors": [
        { "name": "TMS Billing Solutions", "type": "Billing", "account": "TMS-6002", "contact": "tms-support@tms.com", "contract_notes": "Integrated with Office Ally. Monthly fee." },
        { "name": "Office Ally", "type": "EHR/Billing", "account": "OA-LAG-001", "contact": "support@officeally.com", "contract_notes": "Claims submission and ERA processing" },
        { "name": "Stacey V", "type": "Marketing", "account": "—", "contact": "svajrabukka@gmail.com", "contract_notes": "Weekly physician outreach, Laguna and Oceanside. Invoice submitted week of Jun 5 — payment pending." },
        { "name": "Nikhil (health.ai)", "type": "Web Design", "account": "—", "contact": "Nikhil@health.ai", "contract_notes": "Building Pacific Hyperbarics websites for Laguna, Monterey, Madras." }
      ],
      "notes": "Rebrand: Skincredible → Pacific Hyperbarics. Website live: pacifichyperbaricslaguna.com (Jun 5).\n\nMarketing: Stacey V doing weekly physician outreach. Connected with 3 physicians in Laguna Hills/Mission Viejo week of May 26.\n\nNetwork: Basic Netgear router, DHCP default range. No dedicated equipment subnet.\n\nBilling: TMS Billings (Ben Stark) handles insurance follow-up and claims.",
      "action_items": [
        { "task": "Finalize MOU with Bobby / operating structure", "owner": "Michael Greenhalgh", "due": "2026-06-20", "status": "open" },
        { "task": "Pay Stacey V marketing invoice — week of Jun 5", "owner": "Michael Greenhalgh", "due": "2026-06-20", "status": "open" },
        { "task": "Reconcile Account #6002 revenue allocation YTD", "owner": "HMS Finance", "due": "2026-06-30", "status": "open" }
      ],
      "capex": []
    },
    {
      "name": "Oceanside",
      "status": "Buildout In Progress",
      "indicator": "yellow",
      "category": "Buildout",
      "operations": [
        "120-amp electrical installation completed",
        "Chamber #1 onsite",
        "Chamber #2 under vendor evaluation",
        "Inspection pending confirmation"
      ],
      "team": ["Westaway", "Reimers", "Leddy", "Fox", "Electrical Contractor"],
      "risks": [
        { "label": "Inspection approval", "severity": "medium" },
        { "label": "Chamber selection", "severity": "medium" },
        { "label": "Installation scheduling", "severity": "medium" }
      ],
      "next_action": "Confirm inspection outcome and finalize Chamber #2 procurement.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 2800", "serial": "SC-2800-OS1", "warranty": "2029-01", "vendor": "Sechrist Industries", "status": "installed - pending inspection" },
        { "name": "Chamber 2", "model": "TBD", "serial": "—", "warranty": "—", "vendor": "Under evaluation", "status": "not ordered" },
        { "name": "120A Electrical Panel", "model": "Square D QO", "serial": "—", "warranty": "—", "vendor": "Local Contractor", "status": "installed" }
      ],
      "issues": [
        { "id": 1, "description": "City inspection not yet scheduled — blocking chamber pressurization test", "priority": "high", "owner": "Westaway", "status": "open", "opened": "2026-06-01" },
        { "id": 2, "description": "Chamber 2 vendor not selected — 3 bids outstanding", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-05-28" },
        { "id": 3, "description": "Electrical issue flagged by Chamney Electrical (Jun 11) — server/electrical problem noted at site. Scope not yet confirmed.", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-06-11" }
      ],
      "vendors": [
        { "name": "Sechrist Industries", "type": "Equipment", "account": "SECH-0441", "contact": "714-579-8400", "contract_notes": "Chamber 1 purchased. Chamber 2 bid pending." },
        { "name": "Pacific Coast Electric", "type": "Electrical", "account": "PCE-OS22", "contact": "760-555-0192", "contract_notes": "120A install complete. Final punch-list outstanding." }
      ],
      "notes": "Site address: 1842 S Coast Hwy, Oceanside CA 92054.\n\nNetwork: ISP not yet contracted. Will need business fiber before opening.\n\nChamber room: ~400 sq ft, dedicated 120A circuit. Control panel location TBD pending Chamber 2 selection.",
      "action_items": [
        { "task": "Schedule city inspection", "owner": "Westaway", "due": "2026-06-18", "status": "open" },
        { "task": "Select Chamber 2 vendor from bids", "owner": "HMS Ops", "due": "2026-06-22", "status": "open" },
        { "task": "Contract ISP for business fiber", "owner": "Reimers", "due": "2026-07-01", "status": "open" }
      ],
      "capex": [
        { "description": "Chamber 1", "amount": 65000, "category": "Equipment", "vendor": "Sechrist Industries", "expected_date": "2026-01", "status": "paid" },
        { "description": "Chamber 2", "amount": 65000, "category": "Equipment", "vendor": "TBD", "expected_date": "2026-07", "status": "planned" },
        { "description": "120A electrical installation", "amount": 18000, "category": "Construction", "vendor": "Pacific Coast Electric", "expected_date": "2026-05", "status": "paid" },
        { "description": "Business fiber ISP setup", "amount": 1500, "category": "Other", "vendor": "TBD", "expected_date": "2026-07", "status": "planned" }
      ]
    },
    {
      "name": "Salinas",
      "status": "Active",
      "indicator": "green",
      "category": "Operations",
      "operations": [
        "Operating under Cypress Coast Hyperbarics",
        "Included in consolidated reporting",
        "Shared representative support planned"
      ],
      "team": ["Shared Representative", "HMS Billing Team", "Office Ally Team"],
      "risks": [
        { "label": "Shared coverage capacity", "severity": "medium" },
        { "label": "Census growth monitoring", "severity": "medium" }
      ],
      "next_action": "Review representative workload and establish referral growth targets.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 2800", "serial": "SC-2800-SAL1", "warranty": "2027-04", "vendor": "Sechrist Industries", "status": "operational" },
        { "name": "O2 System", "model": "Chart Trifecta", "serial": "CHT-TRI-081", "warranty": "2026-10", "vendor": "Chart Industries", "status": "operational" }
      ],
      "issues": [],
      "vendors": [
        { "name": "AT&T Business", "type": "ISP", "account": "ATT-SAL-5512", "contact": "800-321-2000", "contract_notes": "250Mbps fiber, contract through 2026-11" },
        { "name": "Office Ally", "type": "EHR/Billing", "account": "OA-SAL-002", "contact": "support@officeally.com", "contract_notes": "Claims and ERA" }
      ],
      "notes": "Operating as Cypress Coast Hyperbarics — separate NPI, consolidated into HMS reporting.\n\nNetwork: AT&T fiber. Cisco router. Equipment on isolated VLAN.",
      "action_items": [
        { "task": "Set referral growth targets for Q3", "owner": "Shared Rep", "due": "2026-07-01", "status": "open" }
      ],
      "capex": []
    },
    {
      "name": "Monterey",
      "status": "Staffing Risk",
      "indicator": "red",
      "category": "Operations",
      "operations": [
        "Sydney providing dual-role coverage",
        "Technician recruitment in progress",
        "Census recovery initiatives underway"
      ],
      "team": ["Sydney", "Recruiting Support"],
      "risks": [
        { "label": "Staffing gap", "severity": "high" },
        { "label": "Appointment reliability", "severity": "high" },
        { "label": "Census growth", "severity": "medium" }
      ],
      "next_action": "Recruit replacement technician and stabilize clinic operations.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 2800", "serial": "SC-2800-MON1", "warranty": "2027-08", "vendor": "Sechrist Industries", "status": "operational" },
        { "name": "O2 Concentrator", "model": "Invacare Perfecto2", "serial": "INV-O2-088", "warranty": "2026-08", "vendor": "Invacare", "status": "operational — warranty expiring" }
      ],
      "issues": [
        { "id": 1, "description": "No dedicated chamber technician — Sydney covering front desk + chamber ops, unsustainable", "priority": "high", "owner": "HMS Ops", "status": "open", "opened": "2026-05-01" },
        { "id": 2, "description": "O2 concentrator warranty expires Aug 2026 — need renewal or replacement decision", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-06-10" }
      ],
      "vendors": [
        { "name": "Spectrum Business", "type": "ISP", "account": "SPEC-MON-3301", "contact": "833-267-6094", "contract_notes": "200Mbps cable. Month-to-month." },
        { "name": "Invacare", "type": "Equipment / O2", "account": "INV-MON-088", "contact": "800-333-6900", "contract_notes": "O2 concentrator. Warranty ends Aug 2026." }
      ],
      "notes": "Network: Spectrum cable. Router in front office closet (192.168.0.1). Single network — no VLAN separation.\n\nStaffing note: Sydney is the only employee on-site. Any absence closes the clinic. Priority hire needed.",
      "action_items": [
        { "task": "Post technician job listing (Indeed + LinkedIn)", "owner": "HMS HR", "due": "2026-06-16", "status": "open" },
        { "task": "Decide O2 concentrator: renew warranty or replace", "owner": "HMS Ops", "due": "2026-07-15", "status": "open" },
        { "task": "Interview technician candidates", "owner": "HMS HR", "due": "2026-06-30", "status": "open" }
      ],
      "capex": [
        { "description": "O2 concentrator replacement (if needed)", "amount": 4500, "category": "Equipment", "vendor": "Invacare", "expected_date": "2026-08", "status": "planned" }
      ]
    },
    {
      "name": "Riverside",
      "status": "Buildout In Progress",
      "indicator": "yellow",
      "category": "Buildout",
      "operations": [
        "Chambers #1 and #2 onsite",
        "Air/O2 equipment bids under review",
        "Flooring approval pending",
        "Electrical proposal pending"
      ],
      "team": ["Westaway", "Tim", "Flooring Contractor", "Air/O2 Vendors"],
      "risks": [
        { "label": "Flooring approval", "severity": "medium" },
        { "label": "Electrical proposal", "severity": "medium" },
        { "label": "Equipment selection", "severity": "medium" }
      ],
      "next_action": "Approve flooring proposal and finalize installation schedule.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 3200", "serial": "SC-3200-RIV1", "warranty": "2029-03", "vendor": "Sechrist Industries", "status": "onsite - not installed" },
        { "name": "Chamber 2", "model": "Sechrist 3200", "serial": "SC-3200-RIV2", "warranty": "2029-03", "vendor": "Sechrist Industries", "status": "onsite - not installed" },
        { "name": "Air Compressor", "model": "TBD", "serial": "—", "warranty": "—", "vendor": "Bid pending", "status": "not ordered" },
        { "name": "O2 System", "model": "TBD", "serial": "—", "warranty": "—", "vendor": "Bid pending", "status": "not ordered" }
      ],
      "issues": [
        { "id": 1, "description": "Flooring contractor proposal received — awaiting Tim / HMS approval to proceed", "priority": "medium", "owner": "Tim / HMS", "status": "open", "opened": "2026-06-05" },
        { "id": 2, "description": "Electrical: Chamney Electrical (Darrin) engaged Jun 8. Site visit not yet scheduled — call Sandy (702-218-9602) to arrange access. Invoice sent via text Jun 11, not yet confirmed received.", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-06-08" }
      ],
      "vendors": [
        { "name": "Sechrist Industries", "type": "Equipment", "account": "SECH-0441", "contact": "714-579-8400", "contract_notes": "Both chambers purchased and delivered." },
        { "name": "Rivera Flooring", "type": "Contractor", "account": "—", "contact": "951-555-0188", "contract_notes": "Bid submitted, awaiting approval" },
        { "name": "Chamney Electrical", "type": "Electrical", "account": "—", "contact": "dchamney@chamneyelectrical.com", "contract_notes": "Darrin Chamney, CEO. Engaged Jun 8. Site visit pending — Sandy (702-218-9602) is site contact for access. Invoice outstanding (sent via text Jun 11)." }
      ],
      "notes": "Site: 3720 University Ave, Riverside CA 92501.\n\nNetwork: ISP not yet contracted. Will need business fiber.\n\nBoth chambers are in storage on-site. Installation sequence: flooring → electrical → chamber placement → air/O2 → inspection.",
      "action_items": [
        { "task": "Approve flooring proposal", "owner": "Tim / HMS", "due": "2026-06-17", "status": "open" },
        { "task": "Schedule Chamney Electrical site visit — call Sandy 702-218-9602 for access", "owner": "HMS Ops", "due": "2026-06-18", "status": "open" },
        { "task": "Confirm receipt and pay Chamney Electrical invoice (sent via text Jun 11)", "owner": "HMS Ops", "due": "2026-06-18", "status": "open" },
        { "task": "Select Air/O2 vendor from bids", "owner": "HMS Ops", "due": "2026-06-25", "status": "open" },
        { "task": "Contract ISP for business fiber", "owner": "HMS Ops", "due": "2026-07-01", "status": "open" }
      ],
      "capex": [
        { "description": "Chamber 1", "amount": 75000, "category": "Equipment", "vendor": "Sechrist Industries", "expected_date": "2026-03", "status": "paid" },
        { "description": "Chamber 2", "amount": 75000, "category": "Equipment", "vendor": "Sechrist Industries", "expected_date": "2026-03", "status": "paid" },
        { "description": "Flooring", "amount": 12000, "category": "Construction", "vendor": "Rivera Flooring", "expected_date": "2026-07", "status": "planned" },
        { "description": "Electrical installation", "amount": 22000, "category": "Construction", "vendor": "TBD", "expected_date": "2026-07", "status": "planned" },
        { "description": "Air compressor", "amount": 18000, "category": "Equipment", "vendor": "TBD", "expected_date": "2026-08", "status": "planned" },
        { "description": "O2 system", "amount": 14000, "category": "Equipment", "vendor": "TBD", "expected_date": "2026-08", "status": "planned" },
        { "description": "Business fiber ISP setup", "amount": 1500, "category": "Other", "vendor": "TBD", "expected_date": "2026-08", "status": "planned" }
      ]
    },
    {
      "name": "Madras",
      "status": "Active",
      "indicator": "green",
      "category": "Operations",
      "operations": [
        "Equipment maintenance completed",
        "Six active patients",
        "Insurance billing via TMS active",
        "Twyla Rice extended to 30 more treatments (4x/week)"
      ],
      "team": ["Deb", "TMS Billing"],
      "risks": [
        { "label": "Patient volume growth", "severity": "medium" },
        { "label": "Insurance collections", "severity": "medium" }
      ],
      "next_action": "Increase patient census and monitor insurance collections performance.",
      "equipment": [
        { "name": "Chamber 1", "model": "Sechrist 2800", "serial": "SC-2800-MAD1", "warranty": "2028-02", "vendor": "Sechrist Industries", "status": "operational" },
        { "name": "O2 Concentrator", "model": "Invacare Perfecto2", "serial": "INV-O2-122", "warranty": "2027-02", "vendor": "Invacare", "status": "operational" }
      ],
      "issues": [
        { "id": 1, "description": "Two insurance claims >45 days outstanding — follow-up needed", "priority": "medium", "owner": "Deb / TMS", "status": "open", "opened": "2026-05-25" },
        { "id": 2, "description": "3 veterans interested in cash-pay treatment — pricing decision needed from HMS before Deb can book them.", "priority": "medium", "owner": "HMS Ops", "status": "open", "opened": "2026-06-08" }
      ],
      "vendors": [
        { "name": "TMS Billing Solutions", "type": "Billing", "account": "TMS-MAD-004", "contact": "tms-support@tms.com", "contract_notes": "Handles all insurance billing and follow-up" },
        { "name": "CenturyLink / Lumen", "type": "ISP", "account": "CLK-MAD-7721", "contact": "877-453-8353", "contract_notes": "100Mbps DSL. Month-to-month." }
      ],
      "notes": "Small clinic, Deb (Deborah Dunton) is solo operator. Chamber room is ~250 sq ft.\n\nActive patients: Twyla Rice (extended 30 more treatments, 4x/week as of Jun 15), Bob Williams (kidney issue, resuming ASAP), Phyllis Langsev, Perry Choate, Lamar Yoder, Mike Dunton.\n\nNetwork: CenturyLink DSL. Basic router. Single network.\n\nBilling: TMS Billings handles all insurance claims.",
      "action_items": [
        { "task": "Follow up on 2 outstanding insurance claims >45 days", "owner": "Deb / TMS", "due": "2026-06-20", "status": "open" },
        { "task": "Confirm supply order: Adult masks 6 Medium Large (requested Jun 1)", "owner": "HMS Ops", "due": "2026-06-20", "status": "open" },
        { "task": "Set cash-pay pricing for veterans (3 interested, Deb waiting on answer)", "owner": "HMS Ops", "due": "2026-06-22", "status": "open" },
        { "task": "Recruit 2 additional patients for Q3", "owner": "Deb", "due": "2026-07-31", "status": "open" }
      ],
      "capex": []
    }
  ],
  "actions": [
    { "priority": "High", "action": "Finalize Laguna operating structure", "owner": "Michael / Bobby / HMS", "clinic": "Laguna", "status": "Open" },
    { "priority": "High", "action": "Confirm Oceanside inspection", "owner": "Westaway / Inspector", "clinic": "Oceanside", "status": "Open" },
    { "priority": "High", "action": "Approve Riverside flooring", "owner": "HMS / Tim", "clinic": "Riverside", "status": "Open" },
    { "priority": "High", "action": "Recruit Monterey technician", "owner": "HMS / Sydney", "clinic": "Monterey", "status": "Open" },
    { "priority": "Medium", "action": "Select Oceanside Chamber #2", "owner": "HMS / Vendors", "clinic": "Oceanside", "status": "Open" },
    { "priority": "Medium", "action": "Select Riverside Air/O2 Vendor", "owner": "HMS", "clinic": "Riverside", "status": "Open" },
    { "priority": "Medium", "action": "Monitor Madras insurance collections", "owner": "Deb / TMS", "clinic": "Madras", "status": "Active" },
    { "priority": "Medium", "action": "Review shared representative coverage", "owner": "HMS", "clinic": "Salinas / Monterey", "status": "Active" },
    { "priority": "Medium", "action": "Evaluate Chula Vista expansion", "owner": "HMS Operations", "clinic": "Chula Vista", "status": "Active" }
  ],
  "recent_activity": [
    { "time": "Jun 15", "activity": "Oceanside 120A electrical installation confirmed complete" },
    { "time": "Jun 14", "activity": "Monterey technician candidate interview scheduled" },
    { "time": "Jun 13", "activity": "Riverside flooring bid received from Rivera Flooring" },
    { "time": "Jun 12", "activity": "Laguna MOU draft sent to legal for review" },
    { "time": "Jun 10", "activity": "Madras equipment maintenance completed" }
  ]'::jsonb)
on conflict (id) do update set data = excluded.data, updated_at = now();
