const { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: './config/config.env' });

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || 'ap-south-1';
const bucket = process.env.AWS_S3_BUCKET_NAME;

console.log('=== AWS S3 Connection Test ===');
console.log('Bucket Name:', bucket);
console.log('Region:', region);
console.log('Access Key ID:', accessKeyId ? `${accessKeyId.slice(0, 6)}...` : 'MISSING');

if (!accessKeyId || !secretAccessKey || !bucket) {
  console.error('❌ Missing required AWS S3 environment variables.');
  process.exit(1);
}

const s3Client = new S3Client({
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region,
});

async function runTest() {
  try {
    console.log('\nStep 1: Testing ListObjectsV2 on bucket...');
    const listCmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 });
    const listRes = await s3Client.send(listCmd);
    console.log(`✅ Success! Bucket connected. Current object count: ${listRes.KeyCount || 0}`);

    console.log('\nStep 2: Testing PutObject (upload test file)...');
    const testKey = `test-connection-${Date.now()}.txt`;
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: Buffer.from('CRM AWS S3 connection test successful'),
      ContentType: 'text/plain',
    });
    await s3Client.send(putCmd);
    console.log(`✅ Success! Test object uploaded to S3: "${testKey}"`);

    console.log('\nStep 3: Testing DeleteObject (cleanup test file)...');
    const delCmd = new DeleteObjectCommand({
      Bucket: bucket,
      Key: testKey,
    });
    await s3Client.send(delCmd);
    console.log(`✅ Success! Test object removed from S3.`);

    console.log('\n========================================');
    console.log('🎉 ALL AWS S3 CHECKS PASSED PERFECTLY!');
    console.log('========================================');
  } catch (err) {
    console.error('\n❌ S3 Test Failed:', err.message);
    if (err.name) console.error('Error Name:', err.name);
  }
}

runTest();
