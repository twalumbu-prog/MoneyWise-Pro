const fs = require('fs');
const readline = require('readline');

async function main() {
  const logPath = '/Users/kim_life/.gemini/antigravity/brain/80b10205-28d2-4563-b260-5dbae585b001/.system_generated/logs/transcript.jsonl';
  if (!fs.existsSync(logPath)) {
    console.error('File does not exist');
    return;
  }

  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index < 78 && obj.source === 'SYSTEM' && obj.content && obj.content.includes('finished with result')) {
        console.log(`\n========================================`);
        console.log(`[Step ${obj.step_index}] SYSTEM Task Result:`);
        console.log(`========================================`);
        console.log(obj.content);
      }
    } catch (e) {
      // Ignore
    }
  }
}

main().catch(console.error);
