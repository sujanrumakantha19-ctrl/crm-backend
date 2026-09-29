function formatDob(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return '';
    return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split('T')[0];
  }
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {
    // fallback
  }
  return String(v);
}

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
      { key: 'sourceType', label: 'Source Type' },
      { key: 'assignedToDisplayId', label: 'Assigned To' },
      { key: 'assignedToName', label: 'Assigned To Name' },
      { key: 'projectId.name', label: 'Project' },
      { key: 'plotId.plotNumber', label: 'Plot #' },
      { key: 'propertyInterest', label: 'Property Interest' },
      { key: 'category', label: 'Category' },
      { key: 'budgetMin', label: 'Budget Min' },
      { key: 'budgetMax', label: 'Budget Max' },
      { key: 'gender', label: 'Gender' },
      { key: 'dob', label: 'DOB', format: formatDob },
      { key: 'paymentStatus', label: 'Payment Status' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'bank', label: 'Bank' },
      { key: 'loanStage', label: 'Loan Stage' },
      { key: 'notes', label: 'Notes' },
      { key: 'nextFollowUpDate', label: 'Next Follow Up' },
      { key: 'dateAdded', label: 'Date Added', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
    ],
  },

  followUps: {
    filename: 'followups',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'customerName', label: 'Customer Name' },
      { key: 'staffName', label: 'Staff' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'followUps.date', label: 'Followup Date' },
      { key: 'followUps.nextFollowUpDate', label: 'Next Followup Date' },
      { key: 'followUps.nextAction', label: 'Next Action' },
      { key: 'followUps.outcome', label: 'Outcome' },
      { key: 'followUps.notes', label: 'Notes' },
    ],
  },

  followUpsStaff: {
    filename: 'my-followups',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' },
      { key: 'followUps.date', label: 'Followup Date' },
      { key: 'followUps.nextFollowUpDate', label: 'Next Followup Date' },
      { key: 'followUps.nextAction', label: 'Next Action' },
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
      { key: 'location', label: 'Location' },
      { key: 'projectName', label: 'Project' },
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
      { key: 'description', label: 'Description' },
      { key: 'project.name', label: 'Project' },
      { key: 'assignee.name', label: 'Assignee' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'dueDate', label: 'Due Date', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
      { key: 'dueTime', label: 'Due Time' },
      { key: 'createdAt', label: 'Created', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
      { key: 'comments.length', label: 'Comments', format: (v) => String(v || 0) },
    ],
  },

  projects: {
    filename: 'projects',
    columns: [
      { key: 'displayId', label: 'Project ID' },
      { key: 'name', label: 'Project Name' },
      { key: 'status', label: 'Status' },
      { key: 'category', label: 'Category' },
      { key: 'location', label: 'Location' },
      { key: 'district', label: 'District' },
      { key: 'village', label: 'Village' },
      { key: 'mandal', label: 'Mandal' },
      { key: 'surveyNumber', label: 'Survey Number' },
      { key: 'dtcpNumber', label: 'DTCP Number' },
      { key: 'landType', label: 'Land Type' },
      { key: 'totalLandArea', label: 'Total Land Area', format: (v, item) => `${v || 0} ${item.landAreaUnit || 'Acres'}` },
      { key: 'totalPlots', label: 'Total Plots', format: (v) => String(v || 0) },
      { key: 'availablePlots', label: 'Available Plots', format: (v) => String(v || 0) },
      { key: 'bookedPlots', label: 'Booked Plots', format: (v) => String(v || 0) },
      { key: 'registeredPlots', label: 'Registered Plots', format: (v) => String(v || 0) },
      { key: 'plotSize', label: 'Plot Size', format: (v, item) => v ? `${v} ${item.plotSizeUnit || ''}`.trim() : '' },
      { key: 'pricePerSqUnit', label: 'Price Per Sq Unit', format: (v) => v !== undefined && v !== null ? String(v) : '' },
      { key: 'owner.name', label: 'Owner Name' },
      { key: 'owner.phone', label: 'Owner Phone' },
      { key: 'owner.email', label: 'Owner Email' },
      { key: 'isEnabled', label: 'Enabled', format: (v) => (v ? 'Yes' : 'No') },
      { key: 'createdAt', label: 'Created Date', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
    ],
  },

  projectDetail: {
    filename: 'project-detail',
    columns: [
      // Project
      { key: 'project.displayId', label: 'Project ID' },
      { key: 'project._id', label: 'Project Internal ID' },
      { key: 'project.name', label: 'Project Name' },
      { key: 'project.status', label: 'Project Status' },
      { key: 'project.category', label: 'Category' },
      { key: 'project.location', label: 'Location' },
      { key: 'project.district', label: 'District' },
      { key: 'project.village', label: 'Village' },
      { key: 'project.mandal', label: 'Mandal' },
      { key: 'project.surveyNumber', label: 'Survey Number' },
      { key: 'project.dtcpNumber', label: 'DTCP Number' },
      { key: 'project.landType', label: 'Land Type' },
      { key: 'project.totalLandArea', label: 'Total Land Area', format: (v, item) => `${v} ${item.project?.landAreaUnit || 'Acres'}` },
      { key: 'project.totalPlots', label: 'Total Plots' },
      { key: 'project.plotSize', label: 'Plot Size' },
      { key: 'project.pricePerSqUnit', label: 'Price Per Sq Unit' },
      { key: 'project.description', label: 'Project Description' },
      { key: 'project.isEnabled', label: 'Enabled', format: (v) => (v ? 'Yes' : 'No') },
      { key: 'project.roadFacingPlots', label: 'Road Facing Plots', format: (v) => String(v || 0) },
      { key: 'project.cornerPlots', label: 'Corner Plots', format: (v) => String(v || 0) },
      { key: 'project.latitude', label: 'Latitude' },
      { key: 'project.longitude', label: 'Longitude' },
      { key: 'project.owner.name', label: 'Owner Name' },
      { key: 'project.owner.phone', label: 'Owner Phone' },
      { key: 'project.owner.email', label: 'Owner Email' },
      { key: 'project.owner.address', label: 'Owner Address' },
      { key: 'project.sellers', label: 'Sellers', format: (v) => Array.isArray(v) ? v.map(s => s.name).join('; ') : '' },
      // Plot
      { key: 'plot._id', label: 'Plot Internal ID' },
      { key: 'plot.plotNumber', label: 'Plot Number' },
      { key: 'plot.status', label: 'Plot Status' },
      { key: 'plot.facing', label: 'Facing' },
      { key: 'plot.size', label: 'Size' },
      { key: 'plot.sizeUnit', label: 'Size Unit' },
      { key: 'plot.type', label: 'Plot Type' },
      { key: 'plot.price', label: 'Plot Price' },
      { key: 'plot.expectedRegistrationDate', label: 'Expected Reg. Date' },
      { key: 'plot.registrationDate', label: 'Registration Date' },
      // Booking
      { key: 'plot.bookedBy.name', label: 'Booked Customer' },
      { key: 'plot.bookedBy.phone', label: 'Booked Customer Phone' },
      { key: 'plot.bookedBy.paymentStatus', label: 'Payment Status' },
      { key: 'plot.bookedBy.paymentMethod', label: 'Payment Method' },
      { key: 'plot.bookedBy.advanceAmount', label: 'Advance Amount' },
      { key: 'plot.bookedBy.balanceAmount', label: 'Balance Amount' },
      { key: 'plot.bookedBy.bank', label: 'Bank' },
      { key: 'plot.bookedBy.bankFollowerName', label: 'Bank Follower' },
      { key: 'plot.bookedBy.bankFollowerPhone', label: 'Bank Follower Phone' },
      { key: 'plot.bookedBy.loanStage', label: 'Loan Stage' },
      { key: 'plot.bookedBy.bookedAt', label: 'Booked At' },
      { key: 'plot.bookedBy.leadId', label: 'Booked Lead ID' },
      { key: 'plot.bookedBy.type', label: 'Booked By Type' },
      { key: 'plot.pendingApproval.requestType', label: 'Pending Request Type' },
      { key: 'plot.pendingApproval.customerName', label: 'Pending Customer Name' },
      { key: 'plot.pendingApproval.phone', label: 'Pending Customer Phone' },
      { key: 'plot.pendingApproval.paymentStatus', label: 'Pending Payment Status' },
      { key: 'plot.pendingApproval.paymentMethod', label: 'Pending Payment Method' },
      { key: 'plot.pendingApproval.bank', label: 'Pending Bank' },
      { key: 'plot.pendingApproval.bankFollowerName', label: 'Pending Bank Follower' },
      { key: 'plot.pendingApproval.bankFollowerPhone', label: 'Pending Bank Follower Phone' },
      { key: 'plot.pendingApproval.leadId', label: 'Pending Lead ID' },
      { key: 'plot.pendingApproval.requestedBy', label: 'Requested By' },
      { key: 'plot.pendingApproval.requestedAt', label: 'Requested At' },
      { key: 'plot.pendingApproval.notes', label: 'Pending Notes' },
      { key: 'plot.timeline', label: 'Timeline', format: (v) => Array.isArray(v) ? v.map(e => `${e.label || e.type} (${e.date || ''})`).join('; ') : '' },
      // Customer / Lead
      { key: 'lead.displayId', label: 'Customer ID' },
      { key: 'lead._id', label: 'Customer Internal ID' },
      { key: 'lead.customerName', label: 'Customer Name' },
      { key: 'lead.status', label: 'Lead Status' },
      { key: 'lead.phone', label: 'Lead Phone' },
      { key: 'lead.email', label: 'Email' },
      { key: 'lead.city', label: 'City' },
      { key: 'lead.source', label: 'Source' },
      { key: 'lead.sourceType', label: 'Source Type' },
      { key: 'lead.gender', label: 'Gender' },
      { key: 'lead.budgetMin', label: 'Budget Min' },
      { key: 'lead.budgetMax', label: 'Budget Max' },
      { key: 'lead.category', label: 'Category' },
      { key: 'lead.propertyInterest', label: 'Property Interest' },
      { key: 'lead.notes', label: 'Lead Notes' },
      // Assigned staff
      { key: 'lead.assignedToDisplayId', label: 'Assigned Staff ID' },
      { key: 'lead.assignedTo', label: 'Assigned Staff Internal ID' },
      { key: 'lead.assignedToName', label: 'Assigned Staff Name' },
      // Booking staff (who requested the booking)
      { key: 'staff.displayId', label: 'Booking Staff ID' },
      { key: 'staff.name', label: 'Booking Staff Name' },
      { key: 'staff.phone', label: 'Booking Staff Phone' },
      { key: 'staff.email', label: 'Booking Staff Email' },
      { key: 'staff.role', label: 'Booking Staff Role' },
      // Follow-ups
      { key: 'lead.dateAdded', label: 'Date Added', format: (v) => v ? new Date(v).toISOString().split('T')[0] : '' },
      { key: 'lead.nextFollowUpDate', label: 'Next Follow-up' },
      { key: 'lead.dob', label: 'DOB', format: formatDob },
      { key: 'lead.followUps.length', label: 'Follow-ups Count', format: (v) => String(v || 0) },
      { key: 'latestFollowUp.date', label: 'Last Follow-up Date' },
      { key: 'latestFollowUp.outcome', label: 'Last Follow-up Outcome' },
      { key: 'latestFollowUp.notes', label: 'Last Follow-up Notes' },
    ],
  },

  customers: {
    filename: 'customers',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'customerName', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'city', label: 'City' },
      { key: 'projectId.name', label: 'Project' },
      { key: 'plotId.plotNumber', label: 'Plot #' },
      { key: 'assignedToDisplayId', label: 'Assigned To' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'paymentStatus', label: 'Payment Status' },
      { key: 'loanStage', label: 'Loan Stage' },
      { key: 'bank', label: 'Bank' },
      { key: 'bankFollowerName', label: 'Follower Name' },
      { key: 'bankFollowerPhone', label: 'Follower Phone' },
      { key: 'plotId.expectedRegistrationDate', label: 'Expected Reg. Date' },
    ],
  },

  channelPartners: {
    filename: 'channel_partners',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'companyName', label: 'Company' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'city', label: 'City' },
      { key: 'reraId', label: 'RERA ID' },
      { key: 'commissionRate', label: 'Commission Rate', format: (v) => `${v}%` },
      { key: 'isActive', label: 'Status', format: (v) => (v ? 'Active' : 'Inactive') },
      { key: 'notes', label: 'Notes' },
    ],
  },

  staff: {
    filename: 'staff_members',
    columns: [
      { key: 'displayId', label: 'ID' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'name', label: 'Name' },
      { key: 'designation', label: 'Designation' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'dob', label: 'DOB', format: formatDob },
      { key: 'groupId.name', label: 'Group' },
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
      { key: 'company', label: 'Company' },
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
