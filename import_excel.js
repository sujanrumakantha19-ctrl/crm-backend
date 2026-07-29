const mongoose = require('mongoose');
const xlsx = require('xlsx');
const path = require('path');
const dns = require('dns');
require('dotenv').config({ path: './config/config.env' });

// Ensure DNS resolution for MongoDB Atlas
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Load models
const User = require('./models/User');
const Project = require('./models/Project');
const Plot = require('./models/Plot');
const Lead = require('./models/Lead');
const ActivityLog = require('./models/ActivityLog');
const Notification = require('./models/Notification');
const Task = require('./models/Task');

// Paths to files
const rootDir = path.join(__dirname, '..');
const masterFilePath = path.join(rootDir, 'MASTER  FILE 2024 TO  2026.xlsx');
const callsFilePath = path.join(rootDir, 'OFFICE PHONE CALLS  MASTER FILE  2025 to 2026 (1).xlsx');

// Helper to convert Excel date serial to JS Date
function excelDateToJS(serial) {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

// Name normalization helper for matching
function normalizeName(str) {
  if (!str) return '';
  return str.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Generate unique initials (max 2 chars)
function getInitials(name) {
  if (!name) return 'EX';
  const clean = name.toString().trim().replace(/[^a-zA-Z\s]/g, '');
  const parts = clean.split(/\s+/).filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (clean.length >= 2) {
    return clean.substring(0, 2).toUpperCase();
  }
  return (clean[0] || 'E').toUpperCase() + 'X';
}

// Helper to parse payment method and bank details from LOAN OR CASH column
function parsePaymentMethod(val) {
  if (!val) return { paymentMethod: 'CASH', bank: '' };
  const cleanVal = val.toString().trim();
  if (cleanVal.toUpperCase().includes('LOAN') || cleanVal.toUpperCase().includes('LAON')) {
    let bank = '';
    const parenMatch = cleanVal.match(/\(([^)]+)\)/);
    if (parenMatch) {
      bank = parenMatch[1].trim();
    } else {
      const parts = cleanVal.split(/[\/\s,]+/);
      const bankParts = parts.filter(p => p.toUpperCase() !== 'LOAN' && p.toUpperCase() !== 'LAON' && p.trim() !== '');
      if (bankParts.length > 0) {
        bank = bankParts.join(' ').trim();
      }
    }
    return { paymentMethod: 'LOAN', bank: bank || 'Loan' };
  }
  return { paymentMethod: 'CASH', bank: '' };
}

async function runImport() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully!');

    // 1. Clear database collections (preserving default users)
    console.log('Clearing database collections (except default users)...');
    await Promise.all([
      Project.deleteMany({}),
      Plot.deleteMany({}),
      Lead.deleteMany({}),
      ActivityLog.deleteMany({}),
      Notification.deleteMany({}),
      Task.deleteMany({})
    ]);

    // Keep admin, staff, and cp default users, delete other users
    const defaultEmails = ['admin@gmail.com', 'staff@gmail.com', 'cp@gmail.com'];
    await User.deleteMany({ email: { $nin: defaultEmails } });
    console.log('Collections cleared.');

    // Fetch and store default users for referencing
    const defaultUsers = await User.find({});
    const adminUser = defaultUsers.find(u => u.role === 'admin') || defaultUsers[0];
    const defaultStaff = defaultUsers.find(u => u.role === 'staff') || defaultUsers[0];

    // 2. Parse phone calls Excel to extract unique followers (staff)
    console.log('Parsing phone calls to extract unique followers...');
    const callsWb = xlsx.readFile(callsFilePath);
    const callsSheet = callsWb.Sheets['MASTER FILE '];
    const callsRawData = xlsx.utils.sheet_to_json(callsSheet, { header: 1 });
    
    const uniqueFollowers = new Set();
    for (let i = 2; i < callsRawData.length; i++) {
      const row = callsRawData[i];
      if (!row || row.length === 0) continue;
      const follower = (row[7] || '').toString().trim();
      if (follower && follower !== 'FOLLOWER' && !follower.includes('/') && follower !== 'OFFICE') {
        uniqueFollowers.add(follower);
      }
    }
    console.log(`Found ${uniqueFollowers.size} unique follower names.`);

    // 3. Create User accounts for followers
    console.log('Creating staff user accounts for followers...');
    const userMap = {}; // name -> User Object
    userMap['STAFF USER'] = defaultStaff;
    
    let userIndex = 0;
    for (let follower of uniqueFollowers) {
      const email = `${follower.toLowerCase().replace(/[^a-z0-9]/g, '')}@samyco.com`;
      const initials = getInitials(follower);
      const phone = `+91 90000${String(userIndex++).padStart(5, '0')}`;
      
      try {
        const u = await User.create({
          name: follower,
          initials: initials,
          role: 'staff',
          designation: 'Sales Executive',
          email: email,
          phone: phone,
          avatarBg: ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-amber-500'][userIndex % 6],
          isActive: true,
          password: 'password123' // encrypted by pre-save hook
        });
        userMap[follower.toUpperCase()] = u;
      } catch (err) {
        console.error(`Failed to create user for ${follower}: ${err.message}`);
      }
    }
    console.log(`Created ${Object.keys(userMap).length - 1} new staff users.`);

    // 4. Parse layout details from G.VALUE lookup sheet
    console.log('Parsing G.VALUE sheet layout metadata...');
    const masterWb = xlsx.readFile(masterFilePath);
    const gValSheet = masterWb.Sheets['G.VALUE '];
    const gValRaw = xlsx.utils.sheet_to_json(gValSheet, { header: 1 });
    
    const layoutMeta = {};
    gValRaw.forEach((row, i) => {
      if (i < 1) return;
      const layoutName = (row[8] || '').toString().trim();
      if (layoutName) {
        const norm = normalizeName(layoutName);
        layoutMeta[norm] = {
          village: row[9] ? row[9].toString().trim() : '',
          sfNo: row[10] ? row[10].toString().trim() : '',
          rate: row[11] ? parseFloat(row[11]) || null : null,
          sqFeet: row[12] ? parseFloat(row[12]) || null : null
        };
      }
      
      const leftLayoutName = (row[0] || '').toString().trim();
      if (leftLayoutName && leftLayoutName !== 'NAME') {
        const norm = normalizeName(leftLayoutName);
        if (!layoutMeta[norm]) layoutMeta[norm] = {};
        layoutMeta[norm].priceRange = row[1] ? row[1].toString().trim() : '';
        layoutMeta[norm].gValue = row[2] ? row[2].toString().trim() : '';
        layoutMeta[norm].totalPlots = row[3] ? parseInt(row[3]) || null : null;
      }
    });

    // 5. Gather unique layout names and create Projects
    console.log('Gathering unique layout names...');
    const mSheet = masterWb.Sheets['MASTER FILE '];
    const mRows = xlsx.utils.sheet_to_json(mSheet);
    
    const pSheet = masterWb.Sheets['POLLACHI LAYOUT'];
    const pRows = xlsx.utils.sheet_to_json(pSheet);
    
    const uniqueLayouts = new Set();
    mRows.forEach(row => {
      const layout = (row['LAYOUT NAME'] || '').toString().trim();
      if (layout) uniqueLayouts.add(layout);
    });
    pRows.forEach(row => {
      const layout = (row['LAYOUT NAME'] || '').toString().trim();
      if (layout && layout !== 'LAYOUT NAME' && layout !== 'REG  DATE' && layout !== 'Site No' && layout !== 'Sq.ft' && layout !== 'SITE FACING' && layout !== 'CLIENT NAME') {
        uniqueLayouts.add(layout);
      }
    });
    
    console.log(`Found ${uniqueLayouts.size} unique layouts.`);
    
    const projectMap = {};
    const projectsList = [];
    
    for (let layout of uniqueLayouts) {
      const norm = normalizeName(layout);
      const meta = layoutMeta[norm] || {};
      const isPollachi = layout.toUpperCase().includes('ANANYA') || layout.toUpperCase().includes('POLLACHI');
      const location = isPollachi ? 'Pollachi' : 'Coimbatore';
      const rate = meta.rate || (meta.priceRange ? parseFloat(meta.priceRange.split(' ')[0]) || null : null);
      const totalPlots = meta.totalPlots || 40;
      
      try {
        const proj = await Project.create({
          name: layout,
          location: location,
          description: `Premium layout in ${location}`,
          status: 'Active',
          totalLandArea: 10,
          landAreaUnit: 'Acres',
          surveyNumber: meta.sfNo || 'S.F. NO',
          village: meta.village || 'VILLAGE',
          district: location,
          landType: 'Residential',
          totalPlots: totalPlots,
          plotSize: meta.sqFeet || 200,
          plotSizeUnit: 'Sq Yards',
          pricePerSqUnit: rate || null,
          category: 'Open Plots',
          isEnabled: true
        });
        projectMap[layout.toUpperCase()] = proj;
        projectsList.push({
          id: proj._id,
          name: proj.name,
          normalizedName: norm
        });
      } catch (err) {
        console.error(`Failed to create project ${layout}: ${err.message}`);
      }
    }
    console.log(`Created ${Object.keys(projectMap).length} projects.`);

    // 6. Project search helper
    function findProject(name) {
      if (!name) return null;
      const searchNorm = normalizeName(name);
      let match = projectsList.find(p => p.normalizedName === searchNorm);
      if (match) return match;
      match = projectsList.find(p => p.normalizedName.includes(searchNorm) || searchNorm.includes(p.normalizedName));
      return match || null;
    }

    // 7. Create Plots & Leads (from layout bookings)
    console.log('Processing plots and booking customers...');
    const plotsToInsert = [];
    const leadsToInsert = [];
    
    // Coimbatore plots
    mRows.forEach((row, idx) => {
      const layout = (row['LAYOUT NAME'] || '').toString().trim();
      const project = projectMap[layout.toUpperCase()];
      if (!project) return;
      
      const plotNumber = (row['Site No'] || '').toString().trim();
      if (!plotNumber) return;
      
      const sizeStr = row['Sq.ft'];
      const size = sizeStr ? parseFloat(sizeStr) || 0 : 0;
      const facing = (row['SITE FACING'] || row['FACING '] || 'North').toString().trim();
      
      const client = (row['CLIENT NAME'] || row['BOOKING NAME'] || '').toString().trim();
      const regDate = (row['REG DATE'] || '').toString().trim();
      const docNo = (row['DOCUMENT NO'] || '').toString().trim();
      const bookingStatus = (row['BOOKING'] || '').toString().trim();
      
      let status = 'Available';
      if (regDate || docNo) {
        status = 'Registered';
      } else if (client || bookingStatus) {
        status = 'Booked';
      }
      
      const plotId = new mongoose.Types.ObjectId();
      let bookedBy = undefined;
      
      if (status !== 'Available' && client) {
        bookedBy = {
          name: client,
          phone: (row['PHONE NO'] || row['Phone Number as per Document'] || '').toString().trim(),
          paymentStatus: row['LOAN OR CASH'] === 'CASH' ? 'Fully Paid' : 'Partially Paid',
          type: 'customer'
        };
        
        const payInfo = parsePaymentMethod(row['LOAN OR CASH']);
        const phone = bookedBy.phone || `+91 99000${String(leadsToInsert.length).padStart(5, '0')}`;
        
        leadsToInsert.push({
          customerName: client,
          phone: phone,
          email: `${client.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}_${phone.slice(-4)}@samyco-client.com`,
          city: project.location,
          notes: (row['REMARKS'] || 'Imported booking record.').toString().trim(),
          source: (row['BOOKING CHANNEL'] || 'Direct').toString().trim(),
          sourceType: 'Direct',
          assignedTo: undefined,
          assignedToName: undefined,
          status: 'Customer',
          dateAdded: row['BOOKING DATE'] ? excelDateToJS(row['BOOKING DATE']) || new Date() : new Date(),
          projectId: project._id,
          plotId: plotId,
          paymentStatus: status === 'Registered' ? 'Fully Paid' : 'Partially Paid',
          paymentMethod: payInfo.paymentMethod,
          bank: payInfo.bank,
          followUps: []
        });
      }
      
      plotsToInsert.push({
        _id: plotId,
        projectId: project._id,
        plotNumber: plotNumber,
        status: status,
        facing: facing,
        size: size,
        sizeUnit: 'Sq Yards',
        type: 'Residential',
        price: project.pricePerSqUnit ? size * project.pricePerSqUnit : undefined,
        bookedBy: bookedBy
      });
    });

    // Pollachi plots
    pRows.forEach((row, idx) => {
      const layout = (row['LAYOUT NAME'] || '').toString().trim();
      if (!layout || layout === 'LAYOUT NAME' || layout === 'Site No' || layout === 'Sq.ft' || layout === 'SITE FACING' || layout === 'CLIENT NAME') {
        return;
      }
      const project = projectMap[layout.toUpperCase()];
      if (!project) return;
      
      const plotNumber = (row['Site No'] || '').toString().trim();
      if (!plotNumber) return;
      
      const sizeStr = row['Sq.ft'];
      const size = sizeStr ? parseFloat(sizeStr) || 0 : 0;
      const facing = (row['SITE FACING'] || row['FACING '] || 'North').toString().trim();
      
      const client = (row['CLIENT NAME'] || row['BOOKING NAME'] || '').toString().trim();
      const regDate = (row['REG DATE'] || '').toString().trim();
      const docNo = (row['DOCUMENT NO'] || '').toString().trim();
      const bookingStatus = (row['BOOKING'] || '').toString().trim();
      
      let status = 'Available';
      if (regDate || docNo) {
        status = 'Registered';
      } else if (client || bookingStatus) {
        status = 'Booked';
      }
      
      const plotId = new mongoose.Types.ObjectId();
      let bookedBy = undefined;
      
      if (status !== 'Available' && client) {
        bookedBy = {
          name: client,
          phone: (row['PHONE NO'] || row['Phone Number as per Document'] || '').toString().trim(),
          paymentStatus: row['LOAN OR CASH'] === 'CASH' ? 'Fully Paid' : 'Partially Paid',
          type: 'customer'
        };
        
        const payInfo = parsePaymentMethod(row['LOAN OR CASH']);
        const phone = bookedBy.phone || `+91 99000${String(leadsToInsert.length).padStart(5, '0')}`;
        
        leadsToInsert.push({
          customerName: client,
          phone: phone,
          email: `${client.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}_${phone.slice(-4)}@samyco-client.com`,
          city: project.location,
          notes: (row['REMARKS'] || 'Imported booking record.').toString().trim(),
          source: (row['BOOKING CHANNEL'] || 'Direct').toString().trim(),
          sourceType: 'Direct',
          assignedTo: undefined,
          assignedToName: undefined,
          status: 'Customer',
          dateAdded: row['BOOKING DATE'] ? excelDateToJS(row['BOOKING DATE']) || new Date() : new Date(),
          projectId: project._id,
          plotId: plotId,
          paymentStatus: status === 'Registered' ? 'Fully Paid' : 'Partially Paid',
          paymentMethod: payInfo.paymentMethod,
          bank: payInfo.bank,
          followUps: []
        });
      }
      
      plotsToInsert.push({
        _id: plotId,
        projectId: project._id,
        plotNumber: plotNumber,
        status: status,
        facing: facing,
        size: size,
        sizeUnit: 'Sq Yards',
        type: 'Residential',
        price: project.pricePerSqUnit ? size * project.pricePerSqUnit : undefined,
        bookedBy: bookedBy
      });
    });

    // Bulk insert plots
    console.log(`Inserting ${plotsToInsert.length} plots in chunks...`);
    const chunkSize = 200;
    for (let i = 0; i < plotsToInsert.length; i += chunkSize) {
      const chunk = plotsToInsert.slice(i, i + chunkSize);
      const uniqueChunk = [];
      const seenPlots = new Set();
      chunk.forEach(p => {
        const key = `${p.projectId}_${p.plotNumber}`;
        if (!seenPlots.has(key)) {
          seenPlots.add(key);
          uniqueChunk.push(p);
        }
      });
      await Plot.insertMany(uniqueChunk, { ordered: false }).catch(err => {
        if (err.code !== 11000) console.error('Plot insert error:', err.message);
      });
    }
    const actualPlotsCount = await Plot.countDocuments();
    console.log(`Successfully imported ${actualPlotsCount} plot records.`);

    // 8. Create Leads from phone calls
    console.log('Parsing phone calls to create Leads...');
    for (let i = 2; i < callsRawData.length; i++) {
      const row = callsRawData[i];
      if (!row || row.length === 0) continue;
      
      const name = row[2];
      const phoneRaw = row[3];
      if (!phoneRaw) continue;
      
      const phone = phoneRaw.toString().trim();
      const customerName = name ? name.toString().trim() : `Client - ${phone}`;
      const place = row[4] ? row[4].toString().trim() : '';
      const layout = row[5] ? row[5].toString().trim() : '';
      const typeRaw = row[6] ? row[6].toString().trim() : '';
      const followerRaw = row[7] ? row[7].toString().trim() : '';
      const remarks = row[8] ? row[8].toString().trim() : '';
      const dateSerial = row[1];
      const dateAdded = excelDateToJS(dateSerial) || new Date();
      const matchedProj = findProject(layout);
      const projectId = matchedProj ? matchedProj.id : undefined;
      const staffUser = userMap[followerRaw.toUpperCase()] || defaultStaff;
      
      let sourceType = 'Phone Call';
      if (typeRaw.includes('SITE VISIT')) sourceType = 'Walk-in';
      else if (typeRaw.includes('OFFICE VISIT')) sourceType = 'Walk-in';
      else if (typeRaw.includes('INSTA')) sourceType = 'Instagram';
      else if (typeRaw.includes('OWN CLIENT')) sourceType = 'Direct';
      
      leadsToInsert.push({
        customerName: customerName,
        phone: phone,
        email: `${customerName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}_${phone.slice(-4)}@samyco-client.com`,
        city: place,
        notes: remarks || 'Imported call record.',
        source: typeRaw || 'Office Call',
        sourceType: sourceType,
        assignedTo: staffUser._id,
        assignedToName: staffUser.name,
        status: remarks.toUpperCase().includes('BOOKED') || remarks.toUpperCase().includes('COMPLETED') ? 'Customer' : 'Open',
        dateAdded: dateAdded,
        projectId: projectId,
        paymentStatus: remarks.toUpperCase().includes('BOOKED') || remarks.toUpperCase().includes('COMPLETED') ? 'Partially Paid' : 'Not Paid',
        paymentMethod: 'CASH', // default
        bank: '',
        followUps: []
      });
    }

    console.log(`Inserting ${leadsToInsert.length} leads in chunks...`);
    for (let i = 0; i < leadsToInsert.length; i += chunkSize) {
      const chunk = leadsToInsert.slice(i, i + chunkSize);
      await Lead.insertMany(chunk).catch(err => {
        console.error('Lead insert error:', err.message);
      });
    }
    
    const actualLeadsCount = await Lead.countDocuments();
    console.log(`Successfully imported ${actualLeadsCount} lead records.`);
    
    console.log('\n==================================================');
    console.log('IMPORT COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`Projects: ${Object.keys(projectMap).length} created.`);
    console.log(`Plots:    ${actualPlotsCount} created.`);
    console.log(`Leads:    ${actualLeadsCount} created.`);
    console.log(`Users:    ${Object.keys(userMap).length - 1} staff users created.`);
    console.log('==================================================');

  } catch (err) {
    console.error('CRITICAL ERROR IN IMPORT:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

runImport();
