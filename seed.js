const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config({ path: './config/config.env' });
dns.setServers(['8.8.8.8', '1.1.1.1']);

const User = require('./models/User');
const Project = require('./models/Project');
const Lead = require('./models/Lead');
const Task = require('./models/Task');
const Attendance = require('./models/Attendance');
const ChannelPartner = require('./models/ChannelPartner');
const Group = require('./models/Group');
const ActivityLog = require('./models/ActivityLog');
const Notification = require('./models/Notification');
const Plot = require('./models/Plot');
const Counter = require('./models/Counter');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await Promise.all([
    User.deleteMany({}), Project.deleteMany({}), Lead.deleteMany({}),
    Task.deleteMany({}), Attendance.deleteMany({}), ChannelPartner.deleteMany({}),
    Group.deleteMany({}), ActivityLog.deleteMany({}), Notification.deleteMany({}),
    Plot.deleteMany({}), Counter.deleteMany({}),
  ]);
  await User.collection.dropIndexes().catch(() => {});
  await ChannelPartner.collection.dropIndexes().catch(() => {});
  console.log('Cleared all collections & counters');

  const pass = '12345678';

  // 1. Create Users
  const admin = await User.create({
    name: 'Admin User', initials: 'AU', role: 'admin',
    designation: 'System Administrator', email: 'admin@gmail.com',
    phone: '+91 98765 43210', avatarBg: 'bg-blue-500', isActive: true,
    password: pass, displayId: 'AD-1', employeeId: 'AD001',
  });

  const staff1 = await User.create({
    name: 'Priya Sharma', initials: 'PS', role: 'staff',
    designation: 'Senior Sales Executive', email: 'staff@gmail.com',
    phone: '+91 98765 43211', avatarBg: 'bg-emerald-500', isActive: true,
    password: pass, dob: '1997-06-05'
  });

  const staff2 = await User.create({
    name: 'Ravi Kumar', initials: 'RK', role: 'staff',
    designation: 'Sales Manager', email: 'ravi@crm.com',
    phone: '+91 98765 43212', avatarBg: 'bg-amber-500', isActive: true,
    password: pass, dob: '1990-03-15'
  });

  const staff3 = await User.create({
    name: 'Ananya Reddy', initials: 'AR', role: 'staff',
    designation: 'Sales Executive', email: 'ananya@crm.com',
    phone: '+91 98765 43213', avatarBg: 'bg-purple-500', isActive: true,
    password: pass, dob: '1998-06-08'
  });

  const staff4 = await User.create({
    name: 'Mohammed Irfan', initials: 'MI', role: 'staff',
    designation: 'Customer Support Lead', email: 'irfan@crm.com',
    phone: '+91 98765 43214', avatarBg: 'bg-cyan-500', isActive: true,
    password: pass, dob: '1992-09-20'
  });

  const staff5 = await User.create({
    name: 'Sneha Gupta', initials: 'SG', role: 'staff',
    designation: 'Sales Executive', email: 'sneha@crm.com',
    phone: '+91 98765 43215', avatarBg: 'bg-pink-500', isActive: true,
    password: pass, dob: '1995-11-12'
  });

  const staff6 = await User.create({
    name: 'Vikram Rao', initials: 'VR', role: 'staff',
    designation: 'Marketing Head', email: 'vikram@crm.com',
    phone: '+91 98765 43216', avatarBg: 'bg-indigo-500', isActive: true,
    password: pass, dob: '1988-06-10'
  });

  const staff7 = await User.create({
    name: 'Deepak Joshi', initials: 'DJ', role: 'staff',
    designation: 'Sales Executive', email: 'deepak@crm.com',
    phone: '+91 98765 43217', avatarBg: 'bg-teal-500', isActive: true,
    password: pass, dob: '1993-08-03'
  });

  const staff8 = await User.create({
    name: 'Lakshmi Menon', initials: 'LM', role: 'staff',
    designation: 'Customer Support', email: 'lakshmi@crm.com',
    phone: '+91 98765 43218', avatarBg: 'bg-orange-500', isActive: true,
    password: pass, dob: '1994-12-25'
  });

  const staffList = [staff1, staff2, staff3, staff4, staff5, staff6, staff7, staff8];

  const cp1 = await User.create({
    name: 'Srinivas Associates', initials: 'SA', role: 'partner',
    designation: 'Channel Partner', email: 'cp@gmail.com',
    phone: '+91 98765 43301', avatarBg: 'bg-purple-500', isActive: true,
    password: pass,
  });

  const cp2 = await User.create({
    name: 'RealFirst Realty', initials: 'RR', role: 'partner',
    designation: 'Channel Partner', email: 'realfirst@crm.com',
    phone: '+91 98765 43302', avatarBg: 'bg-blue-500', isActive: true,
    password: pass,
  });

  const cp3 = await User.create({
    name: 'Lakshmi Properties', initials: 'LP', role: 'partner',
    designation: 'Channel Partner', email: 'lakshmiprop@crm.com',
    phone: '+91 98765 43303', avatarBg: 'bg-amber-500', isActive: true,
    password: pass,
  });

  const cp4 = await User.create({
    name: 'Metro Homes', initials: 'MH', role: 'partner',
    designation: 'Channel Partner', email: 'metro@crm.com',
    phone: '+91 98765 43304', avatarBg: 'bg-rose-500', isActive: true,
    password: pass,
  });

  const cp5 = await User.create({
    name: 'South India Realty', initials: 'SR', role: 'partner',
    designation: 'Channel Partner', email: 'sir@crm.com',
    phone: '+91 98765 43305', avatarBg: 'bg-teal-500', isActive: true,
    password: pass,
  });

  console.log(`Created ${1 + staffList.length + 5} users (1 admin, ${staffList.length} staff, 5 CPs)`);

  // 2. Create Groups
  const group1 = await Group.create({ name: 'Sales Team A', description: 'Hyderabad region sales', members: [staff1._id, staff2._id, staff7._id] });
  const group2 = await Group.create({ name: 'Sales Team B', description: 'Bengaluru & Pune sales', members: [staff3._id, staff5._id] });
  const group3 = await Group.create({ name: 'Customer Support', description: 'Post-sales support team', members: [staff4._id, staff8._id] });
  const group4 = await Group.create({ name: 'Marketing', description: 'Digital and field marketing', members: [staff6._id] });

  await User.findByIdAndUpdate(staff1._id, { groupId: group1._id });
  await User.findByIdAndUpdate(staff2._id, { groupId: group1._id });
  await User.findByIdAndUpdate(staff7._id, { groupId: group1._id });
  await User.findByIdAndUpdate(staff3._id, { groupId: group2._id });
  await User.findByIdAndUpdate(staff5._id, { groupId: group2._id });
  await User.findByIdAndUpdate(staff4._id, { groupId: group3._id });
  await User.findByIdAndUpdate(staff8._id, { groupId: group3._id });
  await User.findByIdAndUpdate(staff6._id, { groupId: group4._id });
  console.log('Created 4 groups & assigned staff members');

  // 3. Create Projects
  const projectsData = [
    {
      name: 'Green Valley Enclave', location: 'Hyderabad', description: 'Premium residential plots with modern amenities in a serene green environment.', status: 'Active', totalLandArea: 25, landAreaUnit: 'Acres', surveyNumber: 'HYD-2024-001', village: 'Gachibowli', mandal: 'Serilingampally', district: 'Ranga Reddy', landType: 'Residential', totalPlots: 48, plotSize: 200, plotSizeUnit: 'Sq Yards', roadFacingPlots: 8, cornerPlots: 6, category: 'Open Plots', isEnabled: true, latitude: '17.4483', longitude: '78.3741',
      images: [
        '/plots/land_site_1.jpg',
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1592595896551-12b371d546d5?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_1.jpg',
        '/plots/plot_sketch_2.jpg',
        'https://images.unsplash.com/photo-1524813686514-a57563d77965?q=80&w=1200&auto=format&fit=crop'
      ],
      owner: { name: 'Venkata Land Holdings', phone: '+91 98480 11022', email: 'legal@venkatalands.com', address: 'Gachibowli, Hyderabad' }
    },
    {
      name: 'Sunrise Township', location: 'Bengaluru', description: 'Large scale integrated township with residential and commercial spaces.', status: 'Active', totalLandArea: 80, landAreaUnit: 'Acres', surveyNumber: 'BLR-2024-012', village: 'Whitefield', mandal: 'Bangalore East', district: 'Bangalore Urban', landType: 'Mixed', totalPlots: 120, plotSize: 150, plotSizeUnit: 'Sq Yards', roadFacingPlots: 20, cornerPlots: 12, category: 'Apartments', isEnabled: true, latitude: '12.9716', longitude: '77.5946',
      images: [
        '/plots/land_site_1.jpg',
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_2.jpg',
        '/plots/plot_sketch_1.jpg'
      ],
      owner: { name: 'Sunrise Estates LLP', phone: '+91 98480 22033', address: 'Whitefield, Bengaluru' }
    },
    {
      name: 'Royal Meadows', location: 'Chennai', description: 'Luxury villa plots near the IT corridor with excellent connectivity.', status: 'Upcoming', totalLandArea: 40, landAreaUnit: 'Acres', surveyNumber: 'CHE-2024-008', village: 'OMR', mandal: 'Sholinganallur', district: 'Chengalpattu', landType: 'Residential', totalPlots: 80, plotSize: 300, plotSizeUnit: 'Sq Yards', category: 'Open Plots', isEnabled: true, latitude: '13.0827', longitude: '80.2707',
      images: [
        '/plots/land_site_1.jpg',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_1.jpg',
        '/plots/plot_sketch_2.jpg'
      ],
      owner: { name: 'Royal Meadows Trust', phone: '+91 98480 33044', address: 'OMR, Chennai' }
    },
    {
      name: 'Urban Heights', location: 'Pune', description: 'High-rise ready commercial and residential plots in prime location.', status: 'Active', totalLandArea: 18, landAreaUnit: 'Acres', surveyNumber: 'PUN-2024-005', village: 'Hinjewadi', mandal: 'Mulshi', district: 'Pune', landType: 'Commercial', totalPlots: 64, plotSize: 180, plotSizeUnit: 'Sq Yards', category: 'Commercial', isEnabled: true, latitude: '18.5204', longitude: '73.8567',
      images: [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_2.jpg',
        '/plots/plot_sketch_1.jpg'
      ],
      owner: { name: 'Urban Infra Partners', phone: '+91 98480 44055', address: 'Hinjewadi, Pune' }
    },
    {
      name: 'Lakeview Residency', location: 'Hyderabad', description: 'Waterfront plots with scenic views near the lake.', status: 'On Hold', totalLandArea: 12, landAreaUnit: 'Acres', surveyNumber: 'HYD-2024-009', village: 'Kokapet', mandal: 'Rajendranagar', district: 'Ranga Reddy', landType: 'Residential', totalPlots: 36, plotSize: 250, plotSizeUnit: 'Sq Yards', category: 'Farm Land', isEnabled: true, latitude: '17.3850', longitude: '78.4867',
      images: [
        '/plots/land_site_1.jpg',
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_1.jpg'
      ],
      owner: { name: 'Kokapet Family Estate', phone: '+91 98480 55066', address: 'Kokapet, Hyderabad' }
    },
    {
      name: 'Emerald Villas', location: 'Bengaluru', description: 'Premium villa plots with clubhouse and swimming pool.', status: 'Completed', totalLandArea: 8, landAreaUnit: 'Acres', surveyNumber: 'BLR-2024-003', village: 'Sarjapur', mandal: 'Anekal', district: 'Bangalore Urban', landType: 'Residential', totalPlots: 24, plotSize: 400, plotSizeUnit: 'Sq Yards', category: 'Villas', isEnabled: true, latitude: '12.9250', longitude: '77.7250',
      images: [
        '/plots/land_site_1.jpg',
        'https://images.unsplash.com/photo-1613977257363-707ba9348227?q=80&w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1200&auto=format&fit=crop'
      ],
      plotImages: [
        '/plots/plot_sketch_2.jpg',
        '/plots/plot_sketch_1.jpg'
      ],
      owner: { name: 'Emerald Homes Pvt Ltd', phone: '+91 98480 66077', address: 'Sarjapur, Bengaluru' }
    },
  ];

  const projects = [];
  for (const pData of projectsData) {
    const proj = await Project.create(pData);
    projects.push(proj);
  }
  console.log(`Created ${projects.length} projects`);

  // 4. Create Plots
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  const facings = ['North', 'South', 'East', 'West', 'North East'];
  const customerNames = [
    'Suresh Patel', 'Kavitha Nair', 'Ramesh Babu', 'Deepa Menon', 'Arjun Reddy',
    'Lakshmi Devi', 'Karthik Iyer', 'Meena Joshi', 'Rajesh Sharma', 'Priya Menon',
    'Venkatesh Rao', 'Sunita Reddy', 'Manoj Bajpayee', 'Sunita Verma', 'Prakash Raj'
  ];
  const banks = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Canara Bank'];

  const plotDocs = [];
  for (const project of projects) {
    const isGreenValley = project.name === 'Green Valley Enclave';
    const isSunrise = project.name === 'Sunrise Township';

    for (let i = 1; i <= project.totalPlots; i++) {
      const isReg = (isGreenValley && i <= 4) || (isSunrise && i <= 6);
      const isPending = isGreenValley && i === 23;
      const isBooked = !isReg && !isPending && ((isGreenValley && i <= 12) || (isSunrise && i <= 20) || i <= 3);
      const isCanceled = isGreenValley && i === 15;

      const status = isReg ? 'Registered' : isPending ? 'Pending' : isBooked ? 'Booked' : isCanceled ? 'Canceled' : 'Available';

      const custName = customerNames[(i - 1) % customerNames.length];
      const expRegDate = isReg ? '2025-05-15' : i === 5 ? todayStr : i === 6 ? tomorrowStr : '2025-06-15';

      plotDocs.push({
        projectId: project._id,
        plotNumber: String(i),
        status,
        facing: facings[i % 5],
        size: project.plotSize || 200,
        sizeUnit: project.plotSizeUnit || 'Sq Yards',
        type: ['Residential', 'Commercial'].includes(project.landType) ? project.landType : 'Residential',
        price: (project.plotSize || 200) * 4500,
        expectedRegistrationDate: expRegDate,
        bookedBy: (isBooked || isReg) ? {
          name: custName,
          phone: `+91 9876${String(50000 + i).slice(0, 5)}`,
          paymentStatus: isReg ? 'Fully Paid' : (i % 3 === 0 ? 'Not Paid' : i % 3 === 1 ? 'Partially Paid' : 'Fully Paid'),
          paymentMethod: i % 2 === 0 ? 'LOAN' : 'CASH',
          bank: banks[i % banks.length],
          bankFollowerName: 'Deepak Manager',
          bankFollowerPhone: '+91 98765 99999',
          advanceAmount: 100000,
          balanceAmount: isReg ? 0 : 800000,
          type: 'customer',
        } : undefined,
        pendingApproval: isPending ? {
          requestType: 'booking',
          leadId: 'lead-1040',
          customerName: 'Suresh Patel',
          phone: '+91 98765 11111',
          requestedBy: 'Priya Sharma',
          requestedAt: '2025-06-03 04:30 PM',
          paymentStatus: 'Partially Paid',
          notes: 'Staff submitted booking request after site visit. Awaiting admin verification.',
        } : undefined,
      });
    }
  }
  await Plot.insertMany(plotDocs);
  console.log(`Created plots for all projects`);

  // 5. Create Channel Partners
  await ChannelPartner.create([
    { userId: cp1._id, name: 'Srinivas Associates', companyName: 'Srinivas Realty Pvt Ltd', phone: '+91 98765 43301', email: 'cp@gmail.com', city: 'Hyderabad', reraId: 'A519000001', totalLeads: 45, isActive: true, initials: 'SA', avatarBg: 'bg-purple-500' },
    { userId: cp2._id, name: 'RealFirst Realty', companyName: 'RealFirst Estates', phone: '+91 98765 43302', email: 'realfirst@crm.com', city: 'Bengaluru', reraId: 'B519000023', totalLeads: 32, isActive: true, initials: 'RR', avatarBg: 'bg-blue-500' },
    { userId: cp3._id, name: 'Lakshmi Properties', companyName: 'Lakshmi Builders', phone: '+91 98765 43303', email: 'lakshmiprop@crm.com', city: 'Chennai', reraId: 'C519000011', totalLeads: 18, isActive: true, initials: 'LP', avatarBg: 'bg-amber-500' },
    { userId: cp4._id, name: 'Metro Homes', companyName: 'Metro Real Estate', phone: '+91 98765 43304', email: 'metro@crm.com', city: 'Pune', reraId: 'P519000008', totalLeads: 12, isActive: true, initials: 'MH', avatarBg: 'bg-rose-500' },
    { userId: cp5._id, name: 'South India Realty', companyName: 'SIR Developers', phone: '+91 98765 43305', email: 'sir@crm.com', city: 'Hyderabad', reraId: 'A519000045', totalLeads: 28, isActive: true, initials: 'SR', avatarBg: 'bg-teal-500' },
  ]);
  console.log('Created 5 channel partners');

  // 6. Create Leads
  const leadList = [
    // Assigned to Staff 1 (Priya Sharma)
    { customerName: 'Suresh Patel', phone: '+91 98765 11111', email: 'suresh.patel@gmail.com', city: 'Hyderabad', status: 'Open', sourceType: 'Channel Partner', source: 'Srinivas Associates', assignedTo: staff1._id, assignedToName: staff1.name, dateAdded: new Date('2025-05-20'), dob: '1985-03-15', projectId: projects[0]._id, budgetMin: 1000000, budgetMax: 2500000 },
    { customerName: 'Kavitha Nair', phone: '+91 98765 22222', email: 'kavitha.n@yahoo.com', city: 'Bengaluru', status: 'Qualified', sourceType: 'Staff', source: 'Priya Sharma', assignedTo: staff1._id, assignedToName: staff1.name, dateAdded: new Date('2025-05-18'), dob: '1990-07-22', projectId: projects[1]._id, budgetMin: 1500000, budgetMax: 3000000 },
    { customerName: 'Deepa Menon', phone: '+91 98765 44444', email: 'deepa.menon@gmail.com', city: 'Pune', status: 'Customer', sourceType: 'Channel Partner', source: 'Srinivas Associates', assignedTo: staff1._id, assignedToName: staff1.name, dateAdded: new Date('2025-04-10'), dob: '1992-01-14', projectId: projects[0]._id, paymentStatus: 'Fully Paid', paymentMethod: 'CASH', bank: 'HDFC Bank', advanceAmount: 100000, balanceAmount: 0, budgetMin: 1200000, budgetMax: 2000000 },
    { customerName: 'Sunita Verma', phone: '+91 98765 99012', email: 'sunita.v@gmail.com', city: 'Hyderabad', status: 'Customer', sourceType: 'Channel Partner', source: 'Srinivas Associates', assignedTo: staff1._id, assignedToName: staff1.name, dateAdded: new Date('2025-04-15'), dob: '1986-07-09', projectId: projects[0]._id, paymentStatus: 'Partially Paid', paymentMethod: 'LOAN', bank: 'ICICI Bank', advanceAmount: 100000, balanceAmount: 800000, budgetMin: 1000000, budgetMax: 2000000 },

    // Assigned to Staff 2 (Ravi Kumar)
    { customerName: 'Ramesh Babu', phone: '+91 98765 33333', email: 'ramesh.babu@outlook.com', city: 'Chennai', status: 'Open', sourceType: 'Direct', source: 'Direct Intake', assignedTo: staff2._id, assignedToName: staff2.name, dateAdded: new Date('2025-05-25'), dob: '1988-11-03', projectId: projects[2]._id, budgetMin: 800000, budgetMax: 1800000 },
    { customerName: 'Karthik Iyer', phone: '+91 98765 77777', email: 'karthik.i@gmail.com', city: 'Bengaluru', status: 'Qualified', sourceType: 'Staff', source: 'Ravi Kumar', assignedTo: staff2._id, assignedToName: staff2.name, dateAdded: new Date('2025-05-28'), dob: '1993-04-17', projectId: projects[1]._id, budgetMin: 2000000, budgetMax: 4000000 },
    { customerName: 'Manoj Bajpayee', phone: '+91 98765 99011', email: 'manoj.b@gmail.com', city: 'Patna', status: 'Customer', sourceType: 'Direct', source: 'Walk-In', assignedTo: staff2._id, assignedToName: staff2.name, dateAdded: new Date('2025-05-10'), dob: '1975-04-23', projectId: projects[0]._id, paymentStatus: 'Partially Paid', paymentMethod: 'LOAN', bank: 'State Bank of India', advanceAmount: 150000, balanceAmount: 650000, budgetMin: 1200000, budgetMax: 2200000 },

    // Assigned to Staff 3 (Ananya Reddy)
    { customerName: 'Arjun Reddy', phone: '+91 98765 55555', email: 'arjun.reddy@gmail.com', city: 'Hyderabad', status: 'Unqualified', sourceType: 'Staff', source: 'Ananya Reddy', assignedTo: staff3._id, assignedToName: staff3.name, dateAdded: new Date('2025-05-05'), dob: '1995-09-28', budgetMin: 500000, budgetMax: 1000000 },
    { customerName: 'Sanjay Dutt', phone: '+91 98765 99009', email: 'sanjay.d@outlook.com', city: 'Mumbai', status: 'Qualified', sourceType: 'Staff', source: 'Ananya Reddy', assignedTo: staff3._id, assignedToName: staff3.name, dateAdded: new Date('2025-06-11'), dob: '1979-01-25', projectId: projects[2]._id, budgetMin: 2500000, budgetMax: 5000000 },

    // CP Leads (submitted by Srinivas Associates & others)
    { customerName: 'Lakshmi Devi', phone: '+91 98765 66666', email: 'lakshmi.devi@yahoo.com', city: 'Chennai', status: 'Open', sourceType: 'Channel Partner', source: 'Srinivas Associates', assignedTo: staff1._id, assignedToName: staff1.name, dateAdded: new Date('2025-06-01'), dob: '1987-12-05', projectId: projects[2]._id, budgetMin: 1500000, budgetMax: 3000000 },
    { customerName: 'Meena Joshi', phone: '+91 98765 88888', email: 'meena.j@outlook.com', city: 'Pune', status: 'Open', sourceType: 'Channel Partner', source: 'RealFirst Realty', assignedTo: staff5._id, assignedToName: staff5.name, dateAdded: new Date('2025-06-02'), dob: '1991-08-30', projectId: projects[3]._id, budgetMin: 1000000, budgetMax: 2000000 },

    // Unassigned Open Leads Pool
    { customerName: 'Vijay Kumar', phone: '+91 98765 99001', email: 'vijay.k@gmail.com', city: 'Hyderabad', status: 'Open', sourceType: 'Direct', source: 'Website', dateAdded: new Date('2025-06-10'), dob: '1984-05-12', budgetMin: 800000, budgetMax: 1500000 },
    { customerName: 'Anitha Sharma', phone: '+91 98765 99002', email: 'anitha.s@gmail.com', city: 'Bengaluru', status: 'Open', sourceType: 'Channel Partner', source: 'Srinivas Associates', dateAdded: new Date('2025-06-12'), dob: '1989-10-20', budgetMin: 1200000, budgetMax: 2500000 },
    { customerName: 'Rajesh Sen', phone: '+91 98765 99003', email: 'rajesh.s@yahoo.com', city: 'Kolkata', status: 'Open', sourceType: 'Direct', source: 'Walk-In', dateAdded: new Date('2025-06-14'), dob: '1982-08-15', budgetMin: 1500000, budgetMax: 3000000 },
    { customerName: 'Priya Dharshini', phone: '+91 98765 99004', email: 'priya.d@outlook.com', city: 'Chennai', status: 'Open', sourceType: 'Staff', source: 'Staff Intake', dateAdded: new Date('2025-06-15'), dob: '1991-02-28', budgetMin: 1000000, budgetMax: 2000000 },
    { customerName: 'Amit Verma', phone: '+91 98765 99005', email: 'amit.v@gmail.com', city: 'Pune', status: 'Open', sourceType: 'Direct', source: 'Social Media', dateAdded: new Date('2025-06-18'), dob: '1987-04-24', budgetMin: 1200000, budgetMax: 2200000 },
    { customerName: 'Sneha Reddy', phone: '+91 98765 99006', email: 'sneha.r@gmail.com', city: 'Hyderabad', status: 'Open', sourceType: 'Channel Partner', source: 'Srinivas Associates', dateAdded: new Date('2025-06-20'), dob: '1993-11-08', budgetMin: 900000, budgetMax: 1800000 },
    { customerName: 'Harish Rao', phone: '+91 98765 99007', email: 'harish.rao@yahoo.com', city: 'Hyderabad', status: 'Open', sourceType: 'Direct', source: 'Newspaper Ad', dateAdded: new Date('2025-06-22'), dob: '1980-06-30', budgetMin: 1100000, budgetMax: 2500000 },
    { customerName: 'Divya Teja', phone: '+91 98765 99008', email: 'divya.t@gmail.com', city: 'Bengaluru', status: 'Open', sourceType: 'Direct', source: 'Website', dateAdded: new Date('2025-06-24'), dob: '1995-07-18', budgetMin: 1400000, budgetMax: 2800000 },
  ];

  // Add follow-ups to lead documents
  const leadsWithFollowups = leadList.map((ld, i) => {
    if (!ld.assignedTo) return ld;
    return {
      ...ld,
      nextFollowUpDate: todayStr,
      followUps: [
        {
          id: `fu-${i}-1`,
          date: todayStr,
          nextFollowUpDate: '2025-06-10',
          notes: `Called ${ld.customerName}, discussed project features and budget options. Customer is very keen.`,
          outcome: 'Positive',
          nextAction: 'Schedule site visit'
        },
        {
          id: `fu-${i}-2`,
          date: '2025-05-25',
          nextFollowUpDate: todayStr,
          notes: 'Initial contact made, sent brochure on WhatsApp.',
          outcome: 'Interested',
          nextAction: 'Follow up call'
        }
      ]
    };
  });

  const createdLeads = await Lead.insertMany(leadsWithFollowups);

  for (const lead of createdLeads) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'displayId_L' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    await Lead.findByIdAndUpdate(lead._id, { displayId: `L-${counter.seq}` });
  }
  console.log(`Created ${createdLeads.length} leads with display IDs & follow-ups`);

  // 7. Create Tasks
  await Task.insertMany([
    { title: 'Follow up with Suresh Patel', description: 'Call to schedule site visit for Green Valley Enclave', status: 'To Do', priority: 'High', assignee: staff1._id, assigneeInitials: 'PS', dueDate: new Date('2025-06-05'), project: projects[0]._id },
    { title: 'Send brochure to Kavitha', description: 'Email Sunrise Township brochure and price sheet', status: 'In Progress', priority: 'Medium', assignee: staff1._id, assigneeInitials: 'PS', dueDate: new Date('2025-06-04'), project: projects[1]._id },
    { title: 'Collect balance payment for Plot #5', description: 'Remind Sunita Verma about remaining 20% payment before registration', status: 'To Do', priority: 'High', assignee: staff1._id, assigneeInitials: 'PS', dueDate: new Date('2025-06-08'), project: projects[0]._id },
    { title: 'Prepare quarterly sales report', description: 'Compile Q2 sales data for management review', status: 'To Do', priority: 'Medium', assignee: staff2._id, assigneeInitials: 'RK', dueDate: new Date('2025-06-10') },
    { title: 'Update plot availability', description: 'Mark sold plots in system and update status', status: 'Done', priority: 'Low', assignee: staff1._id, assigneeInitials: 'PS', dueDate: new Date('2025-05-28'), project: projects[0]._id },
    { title: 'Review Royal Meadows layout plan', description: 'Verify approved layout against actual site measurements', status: 'In Progress', priority: 'Medium', assignee: staff3._id, assigneeInitials: 'AR', dueDate: new Date('2025-06-06'), project: projects[2]._id },
  ]);
  console.log('Created 6 tasks');

  // 8. Create Attendance
  const attendanceDocs = staffList.map(st => ({
    staffId: st._id,
    staffName: st.name,
    date: todayStr,
    checkIn: '09:05 AM',
    checkOut: '06:15 PM',
    duration: '9h 10m',
    status: 'Present',
    role: st.designation
  }));
  await Attendance.insertMany(attendanceDocs);
  console.log(`Created attendance records for today`);

  // 9. Create Activity Logs
  await ActivityLog.insertMany([
    { actorId: admin._id, actorName: 'Admin User', actorRole: 'Admin', actorInitials: 'AU', actorAvatarBg: 'bg-blue-500', action: 'Created project Green Valley Enclave', actionType: 'Created', entityType: 'Project', entityId: projects[0]._id, entityName: 'Green Valley Enclave', timestamp: new Date().toISOString() },
    { actorId: staff1._id, actorName: 'Priya Sharma', actorRole: 'Staff', actorInitials: 'PS', actorAvatarBg: 'bg-emerald-500', action: 'Qualified lead Kavitha Nair', actionType: 'Status Change', entityType: 'Lead', entityId: createdLeads[1]._id, entityName: 'Kavitha Nair', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { actorId: staff2._id, actorName: 'Ravi Kumar', actorRole: 'Staff', actorInitials: 'RK', actorAvatarBg: 'bg-amber-500', action: 'Updated lead Ramesh Babu notes', actionType: 'Updated', entityType: 'Lead', entityId: createdLeads[4]._id, entityName: 'Ramesh Babu', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { actorId: cp1._id, actorName: 'Srinivas Associates', actorRole: 'Channel Partner', actorInitials: 'SA', actorAvatarBg: 'bg-purple-500', action: 'Submitted lead Suresh Patel', actionType: 'Created', entityType: 'Lead', entityId: createdLeads[0]._id, entityName: 'Suresh Patel', timestamp: new Date(Date.now() - 10800000).toISOString() },
  ]);
  console.log('Created activity logs');

  console.log('\n✅ Seed completed successfully!');
  console.log('\nCredentials (password for all: 12345678):');
  console.log('  Admin:   admin@gmail.com');
  console.log('  Staff:   staff@gmail.com (Priya Sharma)');
  console.log('  Partner: cp@gmail.com (Srinivas Associates)');

  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
