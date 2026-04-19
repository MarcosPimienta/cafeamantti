const regex = /<[^>]*>?/gm;
const payloads = [
  "<img src=x onerror=alert(1)>",
  "<b>Test</b>",
  "Normal Name",
  "<script>alert('XSS')</script>"
];

payloads.forEach(p => {
  console.log(`Original: ${p}`);
  console.log(`Sanitized: ${p.replace(regex, '')}`);
  console.log('---');
});
