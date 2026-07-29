const mongoose = require('mongoose');
const dns = require('dns');
const logger = require('../utils/logger');
require('dotenv').config({ path: './config/config.env' });

// Node.js DNS resolver falls back to TCP for large SRV responses (e.g. Atlas 3-shard clusters).
// Some DNS servers refuse TCP queries, causing ECONNREFUSED. Use Google/Cloudflare DNS.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Apply a global plugin to map _id to id, remove __v, and flatten populated IDs
mongoose.plugin((schema) => {
  schema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      
      if (typeof doc.populated === 'function') {
        const convertPopulated = (obj, pathPrefix = '') => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const key of Object.keys(obj)) {
            const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
            const popId = doc.populated(currentPath);
            
            if (popId && typeof obj[key] !== 'number') {
              const populatedObj = obj[key];
              
              if (Array.isArray(popId)) {
                obj[key] = popId.map(id => id ? id.toString() : id);
              } else {
                obj[key] = popId.toString();
              }
              
              if (key === 'assignedTo' && populatedObj && populatedObj.name) {
                obj.assignedToName = populatedObj.name;
              } else {
                const objKey = key.endsWith('Id') ? key.slice(0, -2) : `${key}Object`;
                if (obj[objKey] === undefined) {
                  obj[objKey] = populatedObj;
                }
              }
            } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key].constructor && obj[key].constructor.name === 'Object') {
              convertPopulated(obj[key], currentPath);
            }
          }
        };
        
        convertPopulated(ret);
      }
      return ret;
    }
  });
});

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    try {
      const { syncAllCounters } = require('../utils/counterSync');
      await syncAllCounters();
    } catch (syncErr) {
      logger.error(`Error in counter sync: ${syncErr.message}`);
    }
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
