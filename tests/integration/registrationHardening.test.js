const request = require('supertest');
const mongoose = require('mongoose');
const { buildTestApp } = require('../helpers');
const Plot = require('../../models/Plot');
const Project = require('../../models/Project');
const Lead = require('../../models/Lead');
const User = require('../../models/User');

const app = buildTestApp();

describe('Registration Search, Filters & Grouped Pagination Hardening', () => {
  let adminToken, staff1Token, staff2Token;
  let adminUser, staff1User, staff2User;
  let projectA, projectB;
  let lead247, lead2477, lead24770, leadMulti;

  beforeEach(async () => {
    // 1. Create Users
    adminUser = await User.create({
      name: 'Reg Admin',
      initials: 'RA',
      phone: '9876500001',
      email: `reg_admin_${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      displayId: 'STAFF-1',
    });

    staff1User = await User.create({
      name: 'Reg Staff One',
      initials: 'S1',
      phone: '9876500002',
      email: `reg_staff1_${Date.now()}@test.com`,
      password: 'password123',
      role: 'staff',
      displayId: 'STAFF-2',
    });

    staff2User = await User.create({
      name: 'Reg Staff Two',
      initials: 'S2',
      phone: '9876500003',
      email: `reg_staff2_${Date.now()}@test.com`,
      password: 'password123',
      role: 'staff',
      displayId: 'STAFF-3',
    });

    adminToken = adminUser.getSignedJwtToken();
    staff1Token = staff1User.getSignedJwtToken();
    staff2Token = staff2User.getSignedJwtToken();

    // 2. Create Projects
    projectA = await Project.create({
      name: 'Green Meadows Estate',
      location: 'Coimbatore North',
      status: 'Active',
      displayId: 'PROJ-101',
      totalPlots: 50,
      totalLandArea: 10,
      landAreaUnit: 'Acres',
    });

    projectB = await Project.create({
      name: 'Silver Oaks Residency',
      location: 'Coimbatore South',
      status: 'Active',
      displayId: 'PROJ-102',
      totalPlots: 50,
      totalLandArea: 10,
      landAreaUnit: 'Acres',
    });

    // 3. Create Leads with distinct IDs
    lead247 = await Lead.create({
      customerName: 'Customer TwoFourSeven',
      phone: '9876540247',
      displayId: 'L-247',
      status: 'Customer',
      assignedTo: staff1User._id,
      assignedToName: staff1User.name,
      assignedToDisplayId: staff1User.displayId,
    });

    lead2477 = await Lead.create({
      customerName: 'Customer Target 2477',
      phone: '9876542477',
      displayId: 'L-2477',
      status: 'Customer',
      assignedTo: staff1User._id,
      assignedToName: staff1User.name,
      assignedToDisplayId: staff1User.displayId,
    });

    lead24770 = await Lead.create({
      customerName: 'Customer Trailing 24770',
      phone: '9876524770',
      displayId: 'L-24770',
      status: 'Customer',
      assignedTo: staff1User._id,
      assignedToName: staff1User.name,
      assignedToDisplayId: staff1User.displayId,
    });

    leadMulti = await Lead.create({
      customerName: 'Multi Plot Owner',
      phone: '9998887776',
      displayId: 'L-5000',
      status: 'Customer',
      assignedTo: staff1User._id,
      assignedToName: staff1User.name,
      assignedToDisplayId: staff1User.displayId,
    });

    // 4. Seed Plots
    // Plot for L-247
    await Plot.create({
      projectId: projectA._id,
      plotNumber: 'P-247',
      status: 'Booked',
      size: 1200,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-11-01',
      bookedBy: {
        name: lead247.customerName,
        phone: lead247.phone,
        leadId: lead247._id,
        staffId: staff1User._id,
        staffName: staff1User.name,
        staffDisplayId: staff1User.displayId,
        paymentMethod: 'CASH',
        paymentStatus: 'Fully Paid',
      },
    });

    // Plot for L-2477
    await Plot.create({
      projectId: projectA._id,
      plotNumber: 'P-2477',
      status: 'Booked',
      size: 1500,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-11-15',
      bookedBy: {
        name: lead2477.customerName,
        phone: lead2477.phone,
        leadId: lead2477._id,
        staffId: staff1User._id,
        staffName: staff1User.name,
        staffDisplayId: staff1User.displayId,
        paymentMethod: 'LOAN',
        bank: 'HDFC BANK',
        loanStage: 'Sanctioned',
        paymentStatus: 'Partially Paid',
      },
    });

    // Plot for L-24770
    await Plot.create({
      projectId: projectB._id,
      plotNumber: 'P-24770',
      status: 'Booked',
      size: 1800,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-11-20',
      bookedBy: {
        name: lead24770.customerName,
        phone: lead24770.phone,
        leadId: lead24770._id,
        staffId: staff1User._id,
        staffName: staff1User.name,
        staffDisplayId: staff1User.displayId,
        paymentMethod: 'CASH',
        paymentStatus: 'Fully Paid',
      },
    });

    // Seed 4 plots for leadMulti (2 in Project A, 2 in Project B)
    // One with LOAN (SBI), others with CASH
    await Plot.create({
      projectId: projectA._id,
      plotNumber: 'MULTI-1',
      status: 'Booked',
      size: 1000,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-10-20',
      bookedBy: {
        name: leadMulti.customerName,
        phone: leadMulti.phone,
        leadId: leadMulti._id,
        staffId: staff1User._id,
        paymentMethod: 'LOAN',
        bank: 'STATE BANK OF INDIA',
        loanStage: 'In Progress',
        paymentStatus: 'Not Paid',
      },
    });

    await Plot.create({
      projectId: projectA._id,
      plotNumber: 'MULTI-2',
      status: 'Booked',
      size: 1000,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-10-25',
      bookedBy: {
        name: leadMulti.customerName,
        phone: leadMulti.phone,
        leadId: leadMulti._id,
        staffId: staff1User._id,
        paymentMethod: 'CASH',
        paymentStatus: 'Fully Paid',
      },
    });

    await Plot.create({
      projectId: projectB._id,
      plotNumber: 'MULTI-3',
      status: 'Booked',
      size: 1000,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-10-30',
      bookedBy: {
        name: leadMulti.customerName,
        phone: leadMulti.phone,
        leadId: leadMulti._id,
        staffId: staff1User._id,
        paymentMethod: 'CASH',
        paymentStatus: 'Fully Paid',
      },
    });

    await Plot.create({
      projectId: projectB._id,
      plotNumber: 'MULTI-4',
      status: 'Booked',
      size: 1000,
      assignedTo: staff1User._id,
      expectedRegistrationDate: '2026-11-05',
      bookedBy: {
        name: leadMulti.customerName,
        phone: leadMulti.phone,
        leadId: leadMulti._id,
        staffId: staff1User._id,
        paymentMethod: 'CASH',
        paymentStatus: 'Fully Paid',
      },
    });

    // Seed plot for staff2 (should not be visible to staff1)
    await Plot.create({
      projectId: projectA._id,
      plotNumber: 'STAFF2-PLOT',
      status: 'Booked',
      size: 1200,
      assignedTo: staff2User._id,
      expectedRegistrationDate: '2026-10-18T14:30:00.000Z',
      bookedBy: {
        name: 'Staff Two Client',
        phone: '9111222333',
        staffId: staff2User._id,
        paymentMethod: 'LOAN',
        bank: 'ICICI BANK',
        paymentStatus: 'Partially Paid',
      },
    });
  });

  // ─── 1. Search & Customer-ID Correctness ───────────────────────────
  describe('1. Search & Customer-ID Correctness', () => {
    it('should return exactly L-2477 and exclude L-247 and L-24770 when searching ld-2477', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=ld-2477')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].plotNumber).toBe('P-2477');
      expect(res.body.data[0].bookedBy.name).toBe('Customer Target 2477');
    });

    it('should produce identical exact results for LD-2477, ld-2477, and "ld-2477 "', async () => {
      const resUpper = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=LD-2477')
        .set('Authorization', `Bearer ${adminToken}`);

      const resSpace = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=%20ld-2477%20')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resUpper.body.count).toBe(1);
      expect(resSpace.body.count).toBe(1);
      expect(resUpper.body.data[0].plotNumber).toBe('P-2477');
      expect(resSpace.body.data[0].plotNumber).toBe('P-2477');
    });

    it('should resolve advertised project name searches on the backend', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=Silver%20Oaks')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(0);
      // P-24770 is in Silver Oaks Residency
      const plotNumbers = res.body.data.map((p) => p.plotNumber);
      expect(plotNumbers).toContain('P-24770');
    });
  });

  // ─── 2. Grouping Before Pagination & Representative Selection ──────
  describe('2. Grouping Before Pagination & Representative Selection', () => {
    it('should collapse 4 plots for Multi Plot Owner into 1 customer row with relatedBookings', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=9998887776')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.total).toBe(1);
      expect(res.body.totalPlots).toBe(4);
      expect(res.body.data[0].relatedBookingCount).toBe(4);
      expect(res.body.data[0].relatedBookings).toHaveLength(4);
    });

    it('should pick a matching booking as representative when filtering by LOAN', async () => {
      // Multi Plot Owner has 1 LOAN plot (MULTI-1) and 3 CASH plots
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&paymentMethod=LOAN&search=9998887776')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].plotNumber).toBe('MULTI-1');
      expect(res.body.data[0].bookedBy.paymentMethod).toBe('LOAN');
      expect(res.body.data[0].matchingPlotCount).toBe(1);
      // Still maintains awareness of all 4 related bookings
      expect(res.body.data[0].relatedBookingCount).toBe(4);
    });

    it('should return stable customer counts in total and matching plot count in totalPlots', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // We have 5 distinct customers: lead247, lead2477, lead24770, leadMulti, Staff Two Client
      expect(res.body.total).toBe(5);
      // Total plots = 1 + 1 + 1 + 4 + 1 = 8 plots
      expect(res.body.totalPlots).toBe(8);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.totalPlots).toBe(8);
    });
  });

  // ─── 3. Staff Endpoint Parity & Security Scoping ───────────────────
  describe('3. Staff Endpoint Parity & Security Scoping', () => {
    it('should restrict staff1 to their assigned bookings and exclude staff2 bookings', async () => {
      const res = await request(app)
        .get('/api/v1/plots/my-bookings?groupBy=customer&status=Booked')
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(200);
      const plotNumbers = res.body.data.map((p) => p.plotNumber);
      expect(plotNumbers).not.toContain('STAFF2-PLOT');
      expect(res.body.total).toBe(4); // 4 customers assigned to staff1
    });

    it('should apply payment method, bank, and loan stage filters on staff endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/plots/my-bookings?groupBy=customer&status=Booked&paymentMethod=LOAN&bank=HDFC%20BANK&loanStageFilter=Sanctioned')
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].plotNumber).toBe('P-2477');
    });

    it('should include entire selected end date including same-day ISO timestamps', async () => {
      // staff2 has plot booked on '2026-10-18T14:30:00.000Z'
      const res = await request(app)
        .get('/api/v1/plots/my-bookings?groupBy=customer&status=Booked&expectedRegistrationDate[gte]=2026-10-18&expectedRegistrationDate[lte]=2026-10-18')
        .set('Authorization', `Bearer ${staff2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].plotNumber).toBe('STAFF2-PLOT');
    });

    it('should isolate sibling bookings in relatedBookings and relatedBookingCount so another staff members booking is never leaked', async () => {
      const sharedPhone = '9876599999';
      await Plot.create({
        projectId: projectA._id,
        plotNumber: 'ISO-STAFF1',
        status: 'Booked',
        size: 1200,
        sizeUnit: 'Sq Feet',
        facing: 'East',
        type: 'Residential',
        bookedBy: {
          name: 'Shared Phone Cust',
          phone: sharedPhone,
          staffId: String(staff1User._id),
          staffName: staff1User.name,
          staffDisplayId: staff1User.displayId,
          paymentStatus: 'Partially Paid',
          paymentMethod: 'CASH',
        },
      });

      await Plot.create({
        projectId: projectB._id,
        plotNumber: 'ISO-STAFF2',
        status: 'Booked',
        size: 1500,
        sizeUnit: 'Sq Feet',
        facing: 'North',
        type: 'Residential',
        bookedBy: {
          name: 'Shared Phone Cust',
          phone: sharedPhone,
          staffId: String(staff2User._id),
          staffName: staff2User.name,
          staffDisplayId: staff2User.displayId,
          paymentStatus: 'Fully Paid',
          paymentMethod: 'CASH',
        },
      });

      const resStaff1 = await request(app)
        .get(`/api/v1/plots/my-bookings?groupBy=customer&status=Booked&search=${sharedPhone}`)
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(resStaff1.status).toBe(200);
      expect(resStaff1.body.count).toBe(1);
      expect(resStaff1.body.data[0].plotNumber).toBe('ISO-STAFF1');
      const relatedPlotNumbers = (resStaff1.body.data[0].relatedBookings || []).map((r) => r.plotNumber);
      expect(relatedPlotNumbers).toContain('ISO-STAFF1');
      expect(relatedPlotNumbers).not.toContain('ISO-STAFF2');
      expect(resStaff1.body.data[0].relatedBookingCount).toBe(1);
    });

    it('should resolve effective staff identity using displayed precedence (bookedBy staff > assignedTo on plot > lead assignedTo)', async () => {
      const conflictLead = await Lead.create({
        customerName: 'Precedence Customer',
        phone: '9876541111',
        displayId: 'L-9999',
        status: 'Customer',
        assignedTo: staff2User._id,
        assignedToName: staff2User.name,
        assignedToDisplayId: staff2User.displayId,
      });

      await Plot.create({
        projectId: projectA._id,
        plotNumber: 'PREC-1',
        status: 'Booked',
        size: 1200,
        sizeUnit: 'Sq Feet',
        facing: 'East',
        type: 'Residential',
        bookedBy: {
          name: 'Precedence Customer',
          phone: '9876541111',
          staffId: String(staff1User._id),
          staffName: staff1User.name,
          staffDisplayId: staff1User.displayId,
          leadId: String(conflictLead._id),
          paymentStatus: 'Not Paid',
          paymentMethod: 'CASH',
        },
      });

      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=PREC-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      const row = res.body.data[0];
      expect(row.effectiveStaffId).toBe(String(staff1User._id));
      expect(row.effectiveStaffName).toBe(staff1User.name);
      expect(row.effectiveStaffDisplayId).toBe(staff1User.displayId);
    });

    it('should resolve staff search across linked leads even when plot has no direct assignedTo', async () => {
      const leadForSearch = await Lead.create({
        customerName: 'Lead Search Cust',
        phone: '9876542222',
        displayId: 'L-8888',
        status: 'Customer',
        assignedTo: staff2User._id,
        assignedToName: staff2User.name,
        assignedToDisplayId: staff2User.displayId,
      });

      await Plot.create({
        projectId: projectA._id,
        plotNumber: 'LEADONLY-1',
        status: 'Booked',
        size: 1200,
        sizeUnit: 'Sq Feet',
        facing: 'West',
        type: 'Residential',
        bookedBy: {
          name: 'Lead Search Cust',
          phone: '9876542222',
          leadId: String(leadForSearch._id),
          paymentStatus: 'Partially Paid',
          paymentMethod: 'CASH',
        },
      });

      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=STAFF-3')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const plotNumbers = res.body.data.map((p) => p.plotNumber);
      expect(plotNumbers).toContain('LEADONLY-1');
    });

    it('should return additive effectivePaymentStatus and effectiveLoanStage falling back to linked lead', async () => {
      const leadWithPayment = await Lead.create({
        customerName: 'Lead Payment Cust',
        phone: '9876543333',
        displayId: 'L-7777',
        status: 'Customer',
        paymentStatus: 'Advance Paid',
        loanStage: 'Documentation Pending',
      });

      await Plot.create({
        projectId: projectA._id,
        plotNumber: 'EFF-PAY-1',
        status: 'Booked',
        size: 1200,
        sizeUnit: 'Sq Feet',
        facing: 'South',
        type: 'Residential',
        bookedBy: {
          name: 'Lead Payment Cust',
          phone: '9876543333',
          leadId: String(leadWithPayment._id),
          paymentMethod: 'LOAN',
        },
      });

      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&search=EFF-PAY-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      const row = res.body.data[0];
      expect(row.effectivePaymentStatus).toBe('Advance Paid');
      expect(row.effectiveLoanStage).toBe('Documentation Pending');
    });
  });

  // ─── 4. Registration Options Endpoint ──────────────────────────────
  describe('4. Registration Options Endpoint', () => {
    it('should return complete authorized project, bank, and staff options for admin', async () => {
      const res = await request(app)
        .get('/api/v1/plots/registration-options')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.projects)).toBe(true);
      expect(Array.isArray(res.body.data.banks)).toBe(true);
      expect(Array.isArray(res.body.data.staff)).toBe(true);

      const projectNames = res.body.data.projects.map((p) => p.name);
      expect(projectNames).toContain('Green Meadows Estate');
      expect(projectNames).toContain('Silver Oaks Residency');

      expect(res.body.data.banks).toContain('HDFC BANK');
      expect(res.body.data.banks).toContain('STATE BANK OF INDIA');

      const staffNames = res.body.data.staff.map((s) => s.name);
      expect(staffNames).toContain('Reg Staff One');
      expect(staffNames).toContain('Reg Staff Two');
    });

    it('should scope registration-options for staff to their authorized bookings and return only themselves in staff list', async () => {
      const res = await request(app)
        .get('/api/v1/plots/registration-options')
        .set('Authorization', `Bearer ${staff1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.staff).toHaveLength(1);
      expect(res.body.data.staff[0].id).toBe(String(staff1User._id));
      expect(res.body.data.staff[0].name).toBe(staff1User.name);
    });

    it('should reject channel partner calling registration-options with 403 Forbidden', async () => {
      const partnerUser = await User.create({
        name: 'Reg Partner',
        initials: 'RP',
        phone: '9876500004',
        email: `reg_partner_${Date.now()}@test.com`,
        password: 'password123',
        role: 'partner',
        displayId: 'CP-1',
      });
      const partnerToken = partnerUser.getSignedJwtToken();

      const res = await request(app)
        .get('/api/v1/plots/registration-options')
        .set('Authorization', `Bearer ${partnerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── 5. Input Validation & Error Handling ──────────────────────────
  describe('5. Input Validation & Error Handling', () => {
    it('should reject non-existent calendar date February 30 with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&dateFrom=2026-02-30')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid calendar date/i);
    });

    it('should reject garbage dateFrom with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&dateFrom=garbage')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid start date/i);
    });

    it('should reject inverted date range (dateFrom > dateTo) with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&dateFrom=2026-12-01&dateTo=2026-11-01')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/cannot be after/i);
    });

    it('should reject malformed projectId with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&projectId=invalid-mongo-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid project ID format/i);
    });

    it('should reject malformed bookedByUserId with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&bookedByUserId=not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Invalid staff user ID format/i);
    });

    it('should reject invalid payment method with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&paymentMethod=INVALID_METHOD')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid payment method/i);
    });

    it('should reject invalid loan stage with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&loanStageFilter=BOGUS_STAGE')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid loan stage filter/i);
    });

    it('should reject invalid payment status filter with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&paymentStatusFilter=BOGUS_STATUS')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid payment status filter/i);
    });

    it('should reject invalid sortBy with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&sortBy=dangerous_sort')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid sort option/i);
    });

    it('should reject non-integer page with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&page=abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Page must be a positive integer/i);
    });

    it('should reject excessive pagination limit with 400', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Booked&limit=500')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Limit must be an integer between 1 and 100/i);
    });
  });

  // ─── 6. Non-Grouped & Non-Registration Status Preservation ─────────
  describe('6. Non-Grouped & Non-Registration Status Preservation', () => {
    it('should preserve standard Plot query results when groupBy=customer is not passed', async () => {
      const res = await request(app)
        .get('/api/v1/plots?status=Booked')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should preserve standard Plot query results when status is Pending even if groupBy=customer is passed', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should preserve standard Plot query results when status is Available even if groupBy=customer is passed', async () => {
      const res = await request(app)
        .get('/api/v1/plots?groupBy=customer&status=Available')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
