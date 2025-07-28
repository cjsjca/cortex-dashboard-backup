// Quick script to check Pinecone for duplicate Claude messages
const https = require('https');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = 'memory-15be2q5';
const PINECONE_ENV = 'aped-4627-b74a';

if (!PINECONE_API_KEY) {
  console.log('PINECONE_API_KEY not found');
  process.exit(1);
}

// Query Pinecone to count Claude messages
const queryData = JSON.stringify({
  vector: new Array(3072).fill(0), // Dummy vector
  topK: 1000,
  includeMetadata: true,
  filter: {
    source: { "$eq": "claude-log" }
  }
});

const options = {
  hostname: `${PINECONE_INDEX}.svc.${PINECONE_ENV}.pinecone.io`,
  port: 443,
  path: '/query',
  method: 'POST',
  headers: {
    'Api-Key': PINECONE_API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(queryData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.matches) {
        console.log(`Found ${result.matches.length} Claude messages in Pinecone`);
        
        // Check for duplicates by grouping identical content
        const contentMap = {};
        result.matches.forEach(match => {
          const content = match.metadata.content || 'no-content';
          if (contentMap[content]) {
            contentMap[content]++;
          } else {
            contentMap[content] = 1;
          }
        });
        
        const duplicates = Object.values(contentMap).filter(count => count > 1);
        console.log(`Potential duplicates: ${duplicates.length} sets of duplicate content`);
        console.log(`Total duplicate entries: ${duplicates.reduce((sum, count) => sum + (count - 1), 0)}`);
      } else {
        console.log('No Claude messages found or error:', result);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw response:', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
});

req.write(queryData);
req.end();