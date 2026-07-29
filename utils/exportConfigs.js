const configs = {
  leads: {
    filename: 'leads',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'assignedToDisplayId', label: 'Assigned To' },
      { key: 'dateAdded', label: 'Date Added', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
    ],
  },

  followUps: {
    filename: 'followups',
    columns: [
      { key: 'customerName', label: 'Customer Name' },
      { key: 'staffName', label: 'Staff' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'followUps.date', label: 'Followup Date' },
      { key: 'followUps.nextFollowUpDate', label: 'Next Followup Date' },
      { key: 'followUps.outcome', label: 'Outcome' },
      { key: 'followUps.notes', label: 'Notes' },
    ],
  },

  followUpsStaff: {
    filename: 'my-followups',
    columns: [
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'followUps.date', label: 'Followup Date' },
      { key: 'followUps.nextFollowUpDate', label: 'Next Followup Date' },
      { key: 'followUps.outcome', label: 'Outcome' },
      { key: 'followUps.notes', label: 'Notes' },
    ],
  },

  attendanceMain: {
    filename: 'attendance',
    columns: [
      { key: 'staffName', label: 'Staff' },
      { key: 'role', label: 'Role' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' },
      { key: 'activityType', label: 'Activity Type', format: (v) => v || 'Office' },
      { key: 'checkIn', label: 'Check In' },
      { key: 'checkOut', label: 'Check Out' },
      { key: 'duration', label: 'Hours Worked' },
      { key: 'location', label: 'Location' },
      { key: 'projectName', label: 'Project' },
    ],
  },

  attendanceModal: {
    filename: 'attendance-details',
    columns: [
      { key: 'staffName', label: 'Employee' },
      { key: 'role', label: 'Role' },
      { key: 'date', label: 'Date' },
      { key: 'activityType', label: 'Activity Type', format: (v) => v || 'Office' },
      { key: 'checkIn', label: 'Check In' },
      { key: 'checkOut', label: 'Check Out' },
      { key: 'duration', label: 'Hours Worked' },
      { key: 'status', label: 'Status' },
    ],
  },

  tasks: {
    filename: 'tasks',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'project', label: 'Project' },
      { key: 'assignee', label: 'Assignee' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'dueDate', label: 'Due Date' },
    ],
  },

  projects: {
    filename: 'projects',
    columns: [
      { key: 'name', label: 'Project Name' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
      { key: 'totalLandArea', label: 'Total Land Area', format: (v, item) => `${v} ${item.landAreaUnit || 'Acres'}` },
      { key: 'totalPlots', label: 'Total Plots' },
    ],
  },

  customers: {
    filename: 'customers',
    columns: [
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'city', label: 'City' },
      { key: 'bank', label: 'Bank' },
      { key: 'paymentStatus', label: 'Payment Status' },
      { key: 'bankFollowerName', label: 'Follower Name' },
      { key: 'bankFollowerPhone', label: 'Follower Phone' },
    ],
  },

  channelPartners: {
    filename: 'channel_partners',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'companyName', label: 'Company' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'commissionRate', label: 'Commission Rate', format: (v) => `${v}%` },
      { key: 'isActive', label: 'Status', format: (v) => (v ? 'Active' : 'Inactive') },
    ],
  },

  staff: {
    filename: 'staff_members',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'designation', label: 'Designation' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'isActive', label: 'Status', format: (v) => (v ? 'Active' : 'Inactive') },
    ],
  },

  reportProjects: {
    filename: 'report-projects',
    columns: [
      { key: 'name', label: 'Project' },
      { key: 'createdAt', label: 'Created Date', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
      { key: 'totalSqFt', label: 'Total Sq. Ft.', format: (v) => `${v} sq ft` },
      { key: 'plotCount', label: 'Total Plots', format: (v) => String(v || 0) },
      { key: 'booked', label: 'Booked', format: (v) => String(v || 0) },
      { key: 'registered', label: 'Registered', format: (v) => String(v || 0) },
      { key: 'available', label: 'Available', format: (v) => String(v || 0) },
      { key: 'leadCount', label: 'Leads', format: (v) => String(v || 0) },
      { key: 'loanBookings', label: 'Loan', format: (v) => String(v || 0) },
      { key: 'cashBookings', label: 'Cash', format: (v) => String(v || 0) },
    ],
  },

  reportAttendance: {
    filename: 'report-attendance',
    columns: [
      { key: 'staffName', label: 'Staff' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' },
      { key: 'location', label: 'Location' },
      { key: 'projectName', label: 'Project' },
      { key: 'checkIn', label: 'Check In' },
      { key: 'checkOut', label: 'Check Out' },
      { key: 'duration', label: 'Duration' },
      { key: 'role', label: 'Role' },
    ],
  },

  reportStaff: {
    filename: 'report-staff',
    columns: [
      { key: 'name', label: 'Staff' },
      { key: 'designation', label: 'Designation' },
      { key: 'assignedLeads', label: 'Assigned Leads', format: (v) => String(v || 0) },
      { key: 'converted', label: 'Converted', format: (v) => String(v || 0) },
      { key: 'loanConversions', label: 'Loan', format: (v) => String(v || 0) },
      { key: 'cashConversions', label: 'Cash', format: (v) => String(v || 0) },
      { key: 'open', label: 'Open', format: (v) => String(v || 0) },
    ],
  },

  reportLeadsTrend: {
    filename: 'report-leads-trend',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'totalLeads', label: 'Total Leads', format: (v) => String(v || 0) },
      { key: 'openLeads', label: 'Open Leads', format: (v) => String(v || 0) },
      { key: 'qualifiedLeads', label: 'Qualified Leads', format: (v) => String(v || 0) },
      { key: 'plotsBooked', label: 'Plots Booked', format: (v) => String(v || 0) },
      { key: 'loanBookings', label: 'Loan Bookings', format: (v) => String(v || 0) },
      { key: 'cashBookings', label: 'Cash Bookings', format: (v) => String(v || 0) },
      { key: 'conversionRate', label: 'Conversion Rate (%)', format: (v) => `${v || 0}%` },
    ],
  },

  reportLeadContribution: {
    filename: 'report-lead-contribution',
    columns: [
      { key: 'sourceType', label: 'Source / Channel' },
      { key: 'latestDate', label: 'Recent Lead Date' },
      { key: 'totalLeads', label: 'Total Leads', format: (v) => String(v || 0) },
      { key: 'converted', label: 'Converted Customers', format: (v) => String(v || 0) },
      { key: 'plotsBooked', label: 'Plots Booked', format: (v) => String(v || 0) },
      { key: 'loanBookings', label: 'Loan Bookings', format: (v) => String(v || 0) },
      { key: 'cashBookings', label: 'Cash Bookings', format: (v) => String(v || 0) },
      { key: 'conversionRate', label: 'Conversion Rate (%)', format: (v) => `${v || 0}%` },
    ],
  },

  reportChannelPartnerPerformance: {
    filename: 'report-channel-partner-performance',
    columns: [
      { key: 'name', label: 'Channel Partner' },
      { key: 'phone', label: 'Phone' },
      { key: 'companyName', label: 'Company' },
      { key: 'totalLeads', label: 'Total Leads', format: (v) => String(v || 0) },
      { key: 'converted', label: 'Converted', format: (v) => String(v || 0) },
      { key: 'plotsBooked', label: 'Plots Booked', format: (v) => String(v || 0) },
      { key: 'loanBookings', label: 'Loan', format: (v) => String(v || 0) },
      { key: 'cashBookings', label: 'Cash', format: (v) => String(v || 0) },
      { key: 'conversionRate', label: 'Conversion Rate (%)', format: (v) => `${v || 0}%` },
    ],
  },
};

module.exports = configs;
