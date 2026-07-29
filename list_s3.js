const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
dotenv.config({ path: './config/config.env' });

const client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION || 'ap-south-1',
});

async function run() {
  try {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
    }));
    console.log('S3 Objects in bucket:', process.env.AWS_S3_BUCKET_NAME);
    (res.Contents || []).forEach(obj => {
      console.log(' -', obj.Key, '(', obj.Size, 'bytes)');
    });
  } catch (err) {
    console.error('S3 Error:', err);
  }
}

run();
