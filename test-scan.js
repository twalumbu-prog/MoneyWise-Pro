const http = require('http');

const data = JSON.stringify({
  imageUrls: ["test/manual_scans/fake.jpg"]
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/requisitions/REQ-123/scan-receipts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});

req.on('error', console.error);
req.write(data);
req.end();
